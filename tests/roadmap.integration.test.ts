import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { channelByName, createDefaultChannels } from "@/lib/messages";
import { MAX_SUGGESTIONS_PER_DAY, moveRoadmapItem, suggestIdea, toggleRoadmapVote } from "@/lib/roadmap-db";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
let projectId = "", other = "", player = "";
const noop = () => {};

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  const [lead] = await db.insert(s.users).values({ handle: "lead", name: "Lead" }).returning();
  [{ id: player }] = await db.insert(s.users).values({ handle: "player", name: "Player" }).returning();
  [{ id: projectId }] = await db.insert(s.projects).values({ slug: "rm", name: "RM", engine: "godot", ownerId: lead.id }).returning();
  [{ id: other }] = await db.insert(s.projects).values({ slug: "rm2", name: "RM2", engine: "godot", ownerId: lead.id }).returning();
  await createDefaultChannels(db, projectId);
});
afterAll(async () => client.end());

describe("roadmap", () => {
  it("toggles votes only on public, unshipped items of the project", async () => {
    const [item] = await db.insert(s.roadmapItems).values({ projectId, title: "Co-op", column: "next" }).returning();
    const [hidden] = await db.insert(s.roadmapItems).values({ projectId, title: "Secret", public: false }).returning();
    expect(await toggleRoadmapVote(db, projectId, item.id, player)).toBe(true);
    expect(await toggleRoadmapVote(db, projectId, item.id, player)).toBe(false);
    expect(await toggleRoadmapVote(db, projectId, item.id, player)).toBe(true);
    await expect(toggleRoadmapVote(db, projectId, hidden.id, player)).rejects.toThrow();
    await expect(toggleRoadmapVote(db, other, item.id, player)).rejects.toThrow();
    await moveRoadmapItem(db, projectId, item.id, "shipped", 1, noop);
    await moveRoadmapItem(db, projectId, item.id, "shipped", 1, noop);
    await expect(toggleRoadmapVote(db, projectId, item.id, player)).rejects.toThrow();
    const [after] = await db.select().from(s.roadmapItems).where(eq(s.roadmapItems.id, item.id));
    expect(after.shippedAt).not.toBeNull();
    const general = (await channelByName(db, projectId, "general"))!;
    const msgs = (await db.select().from(s.messages).where(eq(s.messages.channelId, general.id))).filter((m) => m.body.startsWith("🚢"));
    expect(msgs.map((m) => m.body)).toEqual(["🚢 Shipped from the roadmap: Co-op (1 vote from players). Worth a devlog post!"]);
    await moveRoadmapItem(db, projectId, item.id, "now", 1, noop);
    const [back] = await db.select().from(s.roadmapItems).where(eq(s.roadmapItems.id, item.id));
    expect(back.shippedAt).toBeNull();
  });

  it("sends suggestions to the inbox as ideas, with a daily limit", async () => {
    for (let i = 0; i < MAX_SUGGESTIONS_PER_DAY; i++) await suggestIdea(db, projectId, { id: player, name: "Player" }, `Idea ${i}`, "");
    await expect(suggestIdea(db, projectId, { id: player, name: "Player" }, "One more", "")).rejects.toThrow(/tomorrow/);
    const ideas = await db.select().from(s.feedbackReports).where(eq(s.feedbackReports.projectId, projectId));
    expect(ideas.every((r) => r.kind === "idea" && r.reporterName === "Player")).toBe(true);
  });
});
