"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { gddLinks, gddPages, projectRepos, projects, tasks } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { AGENT_LABEL, AGENT_WORKFLOW_PATH, agentBrief, agentWorkflow } from "@/lib/agent";
import { recordAgentAssignment } from "@/lib/agent-db";
import { requireUser } from "@/lib/auth";
import { env, githubConfigured } from "@/lib/env";
import { addLabels, commentOnIssue, createIssue, openFilesPullRequest } from "@/lib/github/client";
import { channelByName, postMessage } from "@/lib/messages";

async function linkedRepo(projectId: string, repoId: number) {
  const [link] = await db.select().from(projectRepos).where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.repoId, repoId))).limit(1);
  if (!link) throw new Error("Repo is not linked to this project");
  return link;
}

/** Leads add the agent workflow to a linked repo via a PR (a human merges it, then adds the API key secret). */
export async function openAgentSetupPullRequest(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  if (!githubConfigured()) throw new Error("GitHub isn't configured on this server");
  const link = await linkedRepo(project.id, z.coerce.number().int().parse(form.get("repoId")));
  const url = await openFilesPullRequest(link.installationId, link.fullName, link.defaultBranch, [{ path: AGENT_WORKFLOW_PATH, content: agentWorkflow(env.github.appSlug) }], {
    branchPrefix: "guildhall/ai-agent",
    commitMessage: "ci: add Guildhall AI agent workflow",
    title: "Add the Guildhall AI coding agent",
    body: [
      `Runs [Claude Code](https://github.com/anthropics/claude-code-action) on issues labelled \`${AGENT_LABEL}\`, which Guildhall applies when a lead assigns a task to the agent.`,
      "",
      "Before merging:",
      "1. Add a repository secret `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions).",
      "2. Install the Claude GitHub App on this repo (https://github.com/apps/claude), or pass `github_token` to the action.",
      "",
      "The agent works on a branch and opens a PR; nothing reaches the default branch without review.",
    ].join("\n"),
  });
  await db.update(projectRepos).set({ agentSetupUrl: url }).where(and(eq(projectRepos.projectId, project.id), eq(projectRepos.repoId, link.repoId)));
  const code = await channelByName(db, project.id, "code");
  if (code) await postMessage(db, { channelId: code.id, authorId: null, body: `🤖 ${user.name} opened a PR to enable the AI coding agent on ${link.fullName}: ${url}` });
  revalidatePath(`/p/${slug}/settings`);
}

/** Hand a task to the AI agent: file (or reuse) its GitHub issue with a brief, then apply the agent label. */
export async function assignTaskToAgent(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  if (!githubConfigured()) throw new Error("GitHub isn't configured on this server");
  const taskId = z.string().uuid().parse(form.get("taskId"));
  const instructions = z.string().max(4000).parse(form.get("instructions") ?? "");
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, project.id))).limit(1);
  if (!task) throw new Error("Task not found");
  if (task.status === "done") throw new Error("This task is already done");
  const link = await linkedRepo(project.id, task.ghRepoId ?? z.coerce.number().int().parse(form.get("repoId")));

  const pages = await db
    .select({ id: gddPages.id, title: gddPages.title })
    .from(gddLinks)
    .innerJoin(gddPages, eq(gddPages.id, gddLinks.pageId))
    .where(and(eq(gddLinks.targetType, "task"), eq(gddLinks.targetId, task.id)));
  const [p] = await db.select({ engine: projects.engine }).from(projects).where(eq(projects.id, project.id)).limit(1);
  const brief = agentBrief({
    title: task.title,
    body: task.body,
    instructions,
    projectName: project.name,
    engine: p.engine,
    taskUrl: `${env.appUrl}/p/${slug}/tasks`,
    gddLinks: pages.map((g) => ({ title: g.title, url: `${env.appUrl}/p/${slug}/gdd/${g.id}` })),
  });

  let issue: { number: number; url: string };
  if (task.ghIssueNumber && task.ghUrl) {
    // Existing issue: add the brief as a comment, then the label (the label is what starts the run).
    issue = { number: task.ghIssueNumber, url: task.ghUrl };
    await commentOnIssue(link.installationId, link.fullName, issue.number, brief);
    await addLabels(link.installationId, link.fullName, issue.number, [AGENT_LABEL]);
  } else {
    issue = await createIssue(link.installationId, link.fullName, task.title, brief, [AGENT_LABEL]);
  }
  await recordAgentAssignment(db, task.id, link.repoId, issue, user.id);
  const code = await channelByName(db, project.id, "code");
  if (code) {
    await postMessage(db, {
      channelId: code.id,
      authorId: null,
      threadKey: `agent:${task.id}`,
      body: `🤖 ${user.name} handed "${task.title}" to the AI coding agent. It will work from ${link.fullName}#${issue.number} and open a PR for review.`,
      card: { kind: "issue", title: task.title, url: issue.url, repo: link.fullName, number: issue.number, state: "open", actor: "AI agent" },
    });
  }
  revalidatePath(`/p/${slug}/tasks`);
}
