import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { formTeam, requestToJoin, respondToRequest, runJamReminders, submitEntry, teamOf } from "@/lib/jams-db";
import { channelByName } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const u: Record<string, string> = {};
let jam: typeof s.jams.$inferSelect;
const noop = () => {};

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, jams restart identity cascade`;
  for (const h of ["host", "ana", "ben", "cy", "di"]) u[h] = (await db.insert(s.users).values({ handle: h, name: h.toUpperCase() }).returning())[0].id;
  [jam] = await db.insert(s.jams).values({ slug: "tiny", name: "Tiny Jam", hostId: u.host, startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 47 * 3_600_000), maxTeamSize: 2 }).returning();
});
afterAll(async () => client.end());

describe("jam teams", () => {
  let teamId = "";
  let projectId = "";

  it("forming a team creates a jam workspace and clears the founder's board post", async () => {
    await db.insert(s.jamSeekers).values({ jamId: jam.id, userId: u.ana, note: "coder" });
    const { team, project } = await formTeam(db, jam, u.ana, { name: "Storm Crew", engine: "godot", lookingFor: ["art.pixel"] });
    teamId = team.id;
    projectId = project.id;
    expect(project).toMatchObject({ engagement: "jam", stage: "prototype", slug: "tiny-storm-crew" });
    expect(await channelByName(db, project.id, "general")).toBeTruthy();
    expect(await db.select().from(s.jamSeekers).where(eq(s.jamSeekers.jamId, jam.id))).toHaveLength(0);
    await expect(formTeam(db, jam, u.ana, { name: "Again", engine: "godot", lookingFor: [] })).rejects.toThrow(/already on a team/);
  });

  it("enforces one team per person and the size limit, even with racing accepts", async () => {
    await requestToJoin(db, teamId, u.ben, "art!");
    await requestToJoin(db, teamId, u.cy, "audio!");
    const results = await Promise.allSettled([respondToRequest(db, teamId, u.ben, true, noop), respondToRequest(db, teamId, u.cy, true, noop)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const size = await db.select().from(s.memberships).where(eq(s.memberships.projectId, projectId));
    expect(size).toHaveLength(2);
    await expect(requestToJoin(db, teamId, u.di, "")).rejects.toThrow(/full/);
  });

  it("accepting someone declines their other pending requests", async () => {
    const { team: other } = await formTeam(db, jam, u.di, { name: "Other", engine: "unity", lookingFor: [] });
    const joiner = (await teamOf(db, jam.id, u.ben)) ? u.cy : u.ben;
    await requestToJoin(db, other.id, joiner, "");
    await respondToRequest(db, other.id, joiner, true, noop);
    expect((await teamOf(db, jam.id, joiner))!.team.id).toBe(other.id);
    const [stale] = await db.select().from(s.jamRequests).where(and(eq(s.jamRequests.teamId, teamId), eq(s.jamRequests.userId, joiner)));
    expect(stale.status).toBe("declined");
  });

  it("validates submissions", async () => {
    await expect(submitEntry(db, teamId, "ftp://x")).rejects.toThrow(/https/);
    await submitEntry(db, teamId, "https://ana.itch.io/storm");
    const [t] = await db.select().from(s.jamTeams).where(eq(s.jamTeams.id, teamId));
    expect(t.submissionUrl).toBe("https://ana.itch.io/storm");
    await expect(submitEntry(db, teamId, "https://ana.itch.io/storm", new Date(jam.endsAt.getTime() + 1000))).rejects.toThrow(/closed/);
  });

  it("posts each deadline reminder once, skipping ones already past", async () => {
    const at = (hoursBeforeEnd: number) => new Date(jam.endsAt.getTime() - hoursBeforeEnd * 3_600_000);
    expect(await runJamReminders(db, at(30), noop)).toBe(0);
    expect(await runJamReminders(db, at(23), noop)).toBe(2);
    expect(await runJamReminders(db, at(22), noop)).toBe(0);
    expect(await runJamReminders(db, at(-1), noop)).toBe(2);
    const general = (await channelByName(db, projectId, "general"))!;
    const bodies = (await db.select().from(s.messages).where(eq(s.messages.channelId, general.id))).map((m) => m.body);
    expect(bodies.filter((b) => b.startsWith("⏰ 24 hours"))).toHaveLength(1);
    expect(bodies.filter((b) => b.startsWith("⏰ 1 hour"))).toHaveLength(0);
    expect(bodies.filter((b) => b.startsWith("🏁"))).toHaveLength(1);
  });
});
