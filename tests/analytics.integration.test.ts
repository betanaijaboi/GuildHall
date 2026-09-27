import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { dayKey } from "@/lib/analytics";
import { profileStats, projectStats, pruneAnalytics, recordClick, recordView } from "@/lib/analytics-db";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
let userId = "", projectId = "", pieceId = "";

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, view_hits restart identity cascade`;
  [{ id: userId }] = await db.insert(s.users).values({ handle: "u", name: "U" }).returning();
  [{ id: projectId }] = await db.insert(s.projects).values({ slug: "p", name: "P", engine: "godot", ownerId: userId }).returning();
  [{ id: pieceId }] = await db.insert(s.portfolioItems).values({ userId, title: "Dock", url: "https://a.b" }).returning();
});
afterAll(async () => client.end());

describe("analytics storage", () => {
  it("counts uniques, repeat views and sources per day", async () => {
    const now = new Date();
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
    const v = (hash: string, day: string, source = "direct") => recordView(db, { subjectType: "profile", subjectId: userId, visitorHash: hash, day, source });
    await v("a", today, "Google");
    await v("a", today, "Discord");
    await v("b", today, "Google");
    await v("a", yesterday, "ArtStation");
    await recordClick(db, pieceId, today, "a");
    await recordClick(db, pieceId, today, "a");
    await recordClick(db, pieceId, today, "b");
    const st = await profileStats(db, userId, 7, now);
    expect(st.uniques.at(-1)).toEqual({ day: today, value: 2 });
    expect(st.views.at(-1)).toEqual({ day: today, value: 3 });
    expect(st.uniques.at(-2)!.value).toBe(1);
    expect(st.sources).toEqual(expect.arrayContaining([{ source: "Google", n: 2 }, { source: "ArtStation", n: 1 }]));
    expect(st.sources.some((x) => x.source === "Discord")).toBe(false);
    expect(st.clicks).toEqual([{ id: pieceId, title: "Dock", n: 2 }]);
  });

  it("reports project funnels and prunes old data", async () => {
    await recordView(db, { subjectType: "project", subjectId: projectId, visitorHash: "x", day: dayKey(new Date()), source: "itch.io" });
    await recordView(db, { subjectType: "project", subjectId: projectId, visitorHash: "old", day: "2020-01-01", source: "direct" });
    const [item] = await db.insert(s.roadmapItems).values({ projectId, title: "Co-op" }).returning();
    await db.insert(s.roadmapVotes).values({ itemId: item.id, userId });
    await db.insert(s.feedbackReports).values([{ projectId, source: "sdk", kind: "bug", title: "x" }, { projectId, source: "form", kind: "idea", title: "y" }]);
    const st = await projectStats(db, projectId, 30);
    expect(st.uniques.reduce((a, b) => a + b.value, 0)).toBe(1);
    expect(st).toMatchObject({ roadmapVotes: 1, playtestSignups: 0, feedback: { bug: 1, idea: 1 } });
    await pruneAnalytics(db, new Date());
    const left = await db.select().from(s.viewHits);
    expect(left.some((r) => r.day === "2020-01-01")).toBe(false);
  });
});
