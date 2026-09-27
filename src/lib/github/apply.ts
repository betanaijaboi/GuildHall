import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { githubActivity, githubDeliveries, githubInstallations, projectRepos, tasks, users } from "@/db/schema";
import { channelByName, postMessage, type Notify } from "@/lib/messages";
import { publish, type ChannelEvent } from "@/lib/pubsub";
import { mapEvent, repoIdOf, type Effect } from "./events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

export type ApplyResult = { duplicate: boolean; projects: number; effects: number };

/**
 * Apply one verified webhook delivery. Idempotent on `deliveryId`: GitHub redeliveries are
 * acknowledged without re-applying. Everything runs in one transaction so a failure leaves no
 * half-applied state and the delivery can be retried.
 */
export async function applyWebhook(db: Db, deliveryId: string, event: string, payload: Payload): Promise<ApplyResult> {
  // Live updates are published only after commit, so clients never fetch an uncommitted message.
  const pending: [string, ChannelEvent][] = [];
  const notify: Notify = (channelId, e) => pending.push([channelId, e]);
  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(githubDeliveries)
      .values({ deliveryId, event })
      .onConflictDoNothing()
      .returning({ id: githubDeliveries.deliveryId });
    if (inserted.length === 0) return { duplicate: true, projects: 0, effects: 0 };

    const txDb = tx as unknown as Db;

    if (event === "installation" || event === "installation_repositories") {
      await applyInstallationEvent(txDb, event, payload);
      return { duplicate: false, projects: 0, effects: 0 };
    }

    const repoId = repoIdOf(payload);
    if (repoId == null) return { duplicate: false, projects: 0, effects: 0 };
    const links = await tx.select().from(projectRepos).where(eq(projectRepos.repoId, repoId));
    const effects = mapEvent(event, payload);
    for (const link of links) {
      for (const effect of effects) await applyEffect(txDb, link.projectId, repoId, effect, notify);
    }
    return { duplicate: false, projects: links.length, effects: effects.length };
  });
  for (const [channelId, e] of pending) publish(channelId, e);
  return result;
}

async function applyInstallationEvent(db: Db, event: string, payload: Payload) {
  const installationId: number | undefined = payload.installation?.id;
  if (!installationId) return;
  if (event === "installation") {
    if (payload.action === "deleted") {
      await db.delete(githubInstallations).where(eq(githubInstallations.id, installationId));
    } else if (payload.action === "suspend" || payload.action === "unsuspend") {
      await db
        .update(githubInstallations)
        .set({ suspended: payload.action === "suspend" })
        .where(eq(githubInstallations.id, installationId));
    }
    // "created" is recorded when the installing user returns through the OAuth callback,
    // which is where we can prove which Guildhall user owns it.
    return;
  }
  if (payload.action === "removed") {
    const removed: number[] = (payload.repositories_removed ?? []).map((r: Payload) => r.id);
    if (removed.length) {
      await db
        .delete(projectRepos)
        .where(and(eq(projectRepos.installationId, installationId), inArray(projectRepos.repoId, removed)));
    }
  }
}

async function applyEffect(db: Db, projectId: string, repoId: number, effect: Effect, notify: Notify) {
  switch (effect.type) {
    case "message": {
      const channel = await channelByName(db, projectId, effect.channel);
      if (!channel) return;
      await postMessage(db, { channelId: channel.id, authorId: null, body: effect.body, card: effect.card, threadKey: effect.threadKey }, notify);
      return;
    }
    case "activity": {
      await db.insert(githubActivity).values({
        projectId,
        kind: effect.kind,
        actorLogin: effect.actorLogin,
        title: effect.title,
        url: effect.url,
      });
      return;
    }
    case "task_upsert": {
      const assignee = effect.assigneeLogin
        ? (await db.select({ id: users.id }).from(users).where(eq(users.githubLogin, effect.assigneeLogin)).limit(1))[0]
        : undefined;
      const status = effect.state === "closed" ? "done" : undefined;
      await db
        .insert(tasks)
        .values({
          projectId,
          title: effect.title,
          body: effect.body,
          status: status ?? "todo",
          assigneeId: assignee?.id ?? null,
          ghRepoId: repoId,
          ghIssueNumber: effect.issueNumber,
          ghUrl: effect.url,
          completedAt: status ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [tasks.projectId, tasks.ghRepoId, tasks.ghIssueNumber],
          set: {
            title: effect.title,
            body: effect.body,
            assigneeId: assignee?.id ?? null,
            // Closing on GitHub completes the task; reopening moves a done task back to todo
            // but leaves an in-progress task where the team put it.
            status: effect.state === "closed" ? sql`'done'::task_status` : sql`case when ${tasks.status} = 'done' then 'todo'::task_status else ${tasks.status} end`,
            completedAt: effect.state === "closed" ? sql`coalesce(${tasks.completedAt}, now())` : sql`null`,
          },
        });
      return;
    }
  }
}
