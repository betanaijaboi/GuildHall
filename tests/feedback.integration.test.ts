import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { parseQuestions } from "@/lib/feedback";
import { buildLinkFor, ingestSdkReport, joinPlaytest, reportToTask, submitPlaytestFeedback } from "@/lib/feedback-db";
import { channelByName, createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const u: Record<string, string> = {};
let projectId = "";
let pt: typeof s.playtests.$inferSelect;
const noop = () => {};

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  for (const h of ["lead", "p1", "p2", "p3"]) u[h] = (await db.insert(s.users).values({ handle: h, name: h.toUpperCase() }).returning())[0].id;
  const [p] = await db.insert(s.projects).values({ slug: "fb", name: "FB", engine: "godot", ownerId: u.lead }).returning();
  projectId = p.id;
  await createDefaultChannels(db, projectId);
  [pt] = await db.insert(s.playtests).values({ projectId, title: "Slice test", maxTesters: 2, questions: parseQuestions("rating: Fun?\nchoice: Buy? | Yes | No") }).returning();
});
afterAll(async () => client.end());

describe("playtest program", () => {
  it("falls back to the latest GitHub release for the build", async () => {
    expect(await buildLinkFor(db, pt)).toBeNull();
    await db.insert(s.githubActivity).values({ projectId, kind: "release", title: "v0.4", url: "https://gh/rel/0.4" });
    expect(await buildLinkFor(db, pt)).toBe("https://gh/rel/0.4");
    expect(await buildLinkFor(db, { ...pt, buildUrl: "https://itch/x" })).toBe("https://itch/x");
  });

  it("caps testers under concurrent signups and is idempotent", async () => {
    const r = await Promise.allSettled([joinPlaytest(db, pt.id, u.p1, "Windows"), joinPlaytest(db, pt.id, u.p2, "Linux"), joinPlaytest(db, pt.id, u.p3, "Web")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(2);
    const joined = (await db.select().from(s.playtestTesters).where(eq(s.playtestTesters.playtestId, pt.id))).map((t) => t.userId);
    await joinPlaytest(db, pt.id, joined[0], "Windows");
    expect(await db.select().from(s.playtestTesters).where(eq(s.playtestTesters.playtestId, pt.id))).toHaveLength(2);
  });

  it("only testers can submit, answers are cleaned, and the team is told in a thread", async () => {
    const [tester] = await db.select().from(s.playtestTesters).where(eq(s.playtestTesters.playtestId, pt.id)).limit(1);
    const outsider = [u.p1, u.p2, u.p3].find((x) => x !== tester.userId && true)!;
    const [isTester] = await db.select().from(s.playtestTesters).where(eq(s.playtestTesters.userId, outsider));
    if (!isTester) await expect(submitPlaytestFeedback(db, pt, { id: outsider, name: "X" }, { kind: "feedback", title: "", body: "hi", platform: "", answers: {} }, noop)).rejects.toThrow(/Join/);
    await expect(submitPlaytestFeedback(db, pt, { id: tester.userId, name: "T" }, { kind: "feedback", title: "", body: " ", platform: "", answers: { q1: "9" } }, noop)).rejects.toThrow(/Answer a question/);
    const r = await submitPlaytestFeedback(db, pt, { id: tester.userId, name: "T" }, { kind: "feedback", title: "", body: "Loved the storm", platform: "", answers: { q1: "4", q2: "Maybe?" } }, noop);
    expect(r).toMatchObject({ title: "Slice test feedback", answers: { q1: 4 }, platform: tester.platform, source: "form" });
    await submitPlaytestFeedback(db, pt, { id: tester.userId, name: "T" }, { kind: "bug", title: "Crash on load", body: "x", platform: "", answers: {} }, noop);
    const general = (await channelByName(db, projectId, "general"))!;
    const msgs = await db.select().from(s.messages).where(eq(s.messages.channelId, general.id));
    const thread = msgs.filter((m) => m.threadKey === `playtest:${pt.id}` || m.threadRootId === msgs.find((x) => x.threadKey === `playtest:${pt.id}`)?.id);
    expect(thread).toHaveLength(2);
  });

  it("ingests SDK reports and turns a report into exactly one task", async () => {
    const r = await ingestSdkReport(db, projectId, { kind: "bug", title: "Fell through dock", description: "lighthouse", build: "0.4.1", platform: "Windows", player: "Sam" }, noop);
    const [a, b] = await Promise.all([reportToTask(db, r.id, projectId, "https://x"), reportToTask(db, r.id, projectId, "https://x")]);
    expect(a).toBe(b);
    const [after] = await db.select().from(s.feedbackReports).where(eq(s.feedbackReports.id, r.id));
    expect(after).toMatchObject({ status: "task", taskId: a });
    const [task] = await db.select().from(s.tasks).where(eq(s.tasks.id, a));
    expect(task.title).toBe("Bug: Fell through dock");
  });
});
