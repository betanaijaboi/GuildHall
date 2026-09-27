import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { tasks } from "@/db/schema";
import { channelByName, postMessage, type Notify } from "@/lib/messages";
import { publish } from "@/lib/pubsub";

/**
 * Point a task at the GitHub issue the agent will work from. The issue's own "opened" webhook
 * may already have created a duplicate task for it; that duplicate is removed so the task the
 * lead chose keeps its history.
 */
export async function recordAgentAssignment(db: Db, taskId: string, repoId: number, issue: { number: number; url: string }, requestedBy: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update").limit(1);
    if (!task) throw new Error("Task not found");
    await tx.delete(tasks).where(and(eq(tasks.projectId, task.projectId), eq(tasks.ghRepoId, repoId), eq(tasks.ghIssueNumber, issue.number), ne(tasks.id, task.id)));
    await tx
      .update(tasks)
      .set({ ghRepoId: repoId, ghIssueNumber: issue.number, ghUrl: issue.url, agentStatus: "requested", agentPrUrl: null, agentRequestedBy: requestedBy })
      .where(eq(tasks.id, task.id));
  });
}

const LABEL = { pr_open: "opened a PR", merged: "PR was merged", closed: "PR was closed without merging" } as const;

/** A linked PR changed: move agent tasks along and tell #code. Tasks not handed to the agent are left alone. */
export async function applyAgentPr(
  db: Db,
  projectId: string,
  repoId: number,
  e: { issueNumbers: number[]; state: "pr_open" | "merged" | "closed"; url: string; number: number; title: string },
  notify: Notify = publish,
): Promise<number> {
  const updated = await db
    .update(tasks)
    .set({ agentStatus: e.state, agentPrUrl: e.url })
    .where(and(eq(tasks.projectId, projectId), eq(tasks.ghRepoId, repoId), inArray(tasks.ghIssueNumber, e.issueNumbers), isNotNull(tasks.agentStatus)))
    .returning({ id: tasks.id, title: tasks.title });
  if (!updated.length) return 0;
  const code = await channelByName(db, projectId, "code");
  if (code) {
    for (const t of updated) {
      await postMessage(
        db,
        {
          channelId: code.id,
          authorId: null,
          threadKey: `agent:${t.id}`,
          body: `🤖 AI agent ${LABEL[e.state]} for "${t.title}": #${e.number} ${e.title}${e.state === "pr_open" ? ". It needs a human review before merging." : ""}`,
          card: { kind: "pull_request", title: e.title, url: e.url, number: e.number, state: e.state === "pr_open" ? "open" : e.state, actor: "AI agent" },
        },
        notify,
      );
    }
  }
  return updated.length;
}
