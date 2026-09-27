import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { feedbackReports, githubActivity, playtests, playtestTesters, tasks } from "@/db/schema";
import { cleanAnswers } from "@/lib/feedback";
import { channelByName, postMessage, type Notify } from "@/lib/messages";
import { publish } from "@/lib/pubsub";

export type Playtest = typeof playtests.$inferSelect;
export type Report = typeof feedbackReports.$inferSelect;

/** The build testers get: the playtest's own link, else the latest GitHub release. */
export async function buildLinkFor(db: Db, pt: Playtest): Promise<string | null> {
  if (pt.buildUrl) return pt.buildUrl;
  const [rel] = await db
    .select({ url: githubActivity.url })
    .from(githubActivity)
    .where(and(eq(githubActivity.projectId, pt.projectId), eq(githubActivity.kind, "release")))
    .orderBy(desc(githubActivity.createdAt))
    .limit(1);
  return rel?.url ?? null;
}

/** Sign up as a tester. The playtest row is locked so the tester cap holds under concurrent signups. */
export async function joinPlaytest(db: Db, playtestId: string, userId: string, platform: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [pt] = await tx.select().from(playtests).where(eq(playtests.id, playtestId)).for("update").limit(1);
    if (!pt || !pt.open) throw new Error("This playtest isn't open");
    const [already] = await tx.select().from(playtestTesters).where(and(eq(playtestTesters.playtestId, playtestId), eq(playtestTesters.userId, userId))).limit(1);
    if (already) return;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(playtestTesters).where(eq(playtestTesters.playtestId, playtestId));
    if (n >= pt.maxTesters) throw new Error("This playtest is full");
    await tx.insert(playtestTesters).values({ playtestId, userId, platform: platform.slice(0, 40) });
  });
}

const KIND_ICON = { bug: "🐞", feedback: "💬", idea: "💡" } as const;

/** Tell the team in #general, threaded per playtest (or per SDK) so feedback never floods chat. */
async function announce(db: Db, r: Report, notify: Notify) {
  const general = await channelByName(db, r.projectId, "general");
  if (!general) return;
  await postMessage(
    db,
    {
      channelId: general.id,
      authorId: null,
      threadKey: r.playtestId ? `playtest:${r.playtestId}` : "feedback:sdk",
      body: `${KIND_ICON[r.kind]} New ${r.kind === "feedback" ? "player feedback" : r.kind}${r.source === "sdk" ? " from the in-game reporter" : r.source === "discord" ? " from Discord" : ""}: ${r.title}${r.reporterName ? ` (${r.reporterName})` : ""}`,
    },
    notify,
  );
}

export async function submitPlaytestFeedback(
  db: Db,
  pt: Playtest,
  user: { id: string; name: string },
  input: { kind: "bug" | "feedback" | "idea"; title: string; body: string; platform: string; answers: Record<string, unknown> },
  notify: Notify = publish,
): Promise<Report> {
  const [tester] = await db.select().from(playtestTesters).where(and(eq(playtestTesters.playtestId, pt.id), eq(playtestTesters.userId, user.id))).limit(1);
  if (!tester) throw new Error("Join the playtest first");
  const answers = cleanAnswers(pt.questions, input.answers);
  if (!input.body.trim() && !Object.keys(answers).length) throw new Error("Answer a question or write a note");
  const [r] = await db
    .insert(feedbackReports)
    .values({
      projectId: pt.projectId,
      playtestId: pt.id,
      source: "form",
      kind: input.kind,
      reporterId: user.id,
      reporterName: user.name,
      title: input.title.trim() || `${pt.title} feedback`,
      body: input.body.trim().slice(0, 8000),
      answers,
      platform: (input.platform || tester.platform).slice(0, 80),
    })
    .returning();
  await announce(db, r, notify);
  return r;
}

export async function ingestSdkReport(
  db: Db,
  projectId: string,
  input: { kind: "bug" | "feedback" | "idea"; title: string; description: string; build: string; platform: string; player: string; screenshotKey?: string; screenshotMime?: string; source?: "sdk" | "discord" },
  notify: Notify = publish,
): Promise<Report> {
  const [r] = await db
    .insert(feedbackReports)
    .values({
      projectId,
      source: input.source ?? "sdk",
      kind: input.kind,
      reporterName: input.player,
      title: input.title,
      body: input.description,
      build: input.build,
      platform: input.platform,
      screenshotKey: input.screenshotKey ?? null,
      screenshotMime: input.screenshotMime ?? null,
    })
    .returning();
  await announce(db, r, notify);
  return r;
}

/** Turn a report into a task on the board (idempotent: a report maps to at most one task). */
export async function reportToTask(db: Db, reportId: string, projectId: string, link: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(feedbackReports).where(and(eq(feedbackReports.id, reportId), eq(feedbackReports.projectId, projectId))).for("update").limit(1);
    if (!r) throw new Error("Report not found");
    if (r.taskId) return r.taskId;
    const [task] = await tx.insert(tasks).values({ projectId, title: `${r.kind === "bug" ? "Bug: " : ""}${r.title}`.slice(0, 200), body: `${r.body}\n\nFrom player feedback: ${link}` }).returning();
    await tx.update(feedbackReports).set({ status: "task", taskId: task.id }).where(eq(feedbackReports.id, r.id));
    return task.id;
  });
}
