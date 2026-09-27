import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { alertForListing, markAllRead, runWeeklyDigests, unreadCount } from "@/lib/alerts-db";
import type { Email } from "@/lib/mailer";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const u: Record<string, string> = {};
let pub = "", priv = "";

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  for (const h of ["lead", "writer", "artist", "member"]) u[h] = (await db.insert(s.users).values({ handle: h, name: h.toUpperCase(), engines: ["godot"], lastDigestAt: new Date() }).returning())[0].id;
  [{ id: pub }] = await db.insert(s.projects).values({ slug: "pub", name: "Pub", engine: "godot", ownerId: u.lead }).returning();
  [{ id: priv }] = await db.insert(s.projects).values({ slug: "priv", name: "Priv", engine: "godot", ownerId: u.lead, visibility: "private" }).returning();
  await db.insert(s.memberships).values([{ projectId: pub, userId: u.lead, role: "owner" }, { projectId: pub, userId: u.member, role: "member" }]);
  await db.insert(s.profileSkills).values({ userId: u.writer, skillId: "narrative.writing" });
  await db.insert(s.savedSearches).values([
    { userId: u.writer, name: "Writing on Godot", skill: "narrative.writing", engine: "godot" },
    { userId: u.writer, name: "Any Godot", engine: "godot" },
    { userId: u.artist, name: "Pixel", skill: "art.pixel" },
    { userId: u.member, name: "Writing", skill: "narrative.writing" },
  ]);
});
afterAll(async () => client.end());

describe("role alerts", () => {
  it("notify matching searchers once, never the team or for private projects", async () => {
    const [l] = await db.insert(s.roleListings).values({ projectId: pub, skillId: "narrative.writing", title: "Writer", engagement: "revshare" }).returning();
    expect(await alertForListing(db, l.id)).toBe(1);
    expect(await alertForListing(db, l.id)).toBe(0);
    expect(await unreadCount(db, u.writer)).toBe(1);
    expect(await unreadCount(db, u.member)).toBe(0);
    expect(await unreadCount(db, u.artist)).toBe(0);
    const [p] = await db.insert(s.roleListings).values({ projectId: priv, skillId: "narrative.writing", title: "Secret writer", engagement: "paid" }).returning();
    expect(await alertForListing(db, p.id)).toBe(0);
    await markAllRead(db, u.writer);
    expect(await unreadCount(db, u.writer)).toBe(0);
  });
});

describe("weekly digest", () => {
  it("sends once per week, emails only opted-in people, and skips empty digests", async () => {
    await db.update(s.users).set({ lastDigestAt: new Date(Date.now() - 8 * 86_400_000) });
    await db.update(s.users).set({ email: "w@example.com", emailDigest: true }).where(eq(s.users.id, u.writer));
    await db.update(s.users).set({ email: "a@example.com", emailDigest: false }).where(eq(s.users.id, u.artist));
    const sent: Email[] = [];
    const mailer = async (e: Email) => (sent.push(e), true);
    const now = new Date();
    const r1 = await runWeeklyDigests(db, now, mailer, "https://gh.io");
    expect(r1).toEqual({ sent: 1, emailed: 1 });
    expect(sent[0].to).toBe("w@example.com");
    expect(sent[0].text).toContain("Writer (Writing) on Pub");
    const [n] = await db.select().from(s.notifications).where(eq(s.notifications.kind, "digest"));
    expect(n.userId).toBe(u.writer);
    expect(n.data.lines).toContain("## Roles for you");
    expect(await runWeeklyDigests(db, new Date(now.getTime() + 3_600_000), mailer, "https://gh.io")).toEqual({ sent: 0, emailed: 0 });
    const [artist] = await db.select().from(s.users).where(eq(s.users.id, u.artist));
    expect(artist.lastDigestAt!.getTime()).toBe(now.getTime());
  });
});
