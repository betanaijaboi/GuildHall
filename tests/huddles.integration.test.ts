import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { activeHuddle, activeParticipants, connect, createRecapTasks, disconnect, endHuddle, startHuddle } from "@/lib/huddles-db";
import { channelByName, createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const ids = { amara: "", mei: "", guest: "", project: "", channel: "" };

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  const mk = async (handle: string) => (await db.insert(s.users).values({ handle, name: handle[0].toUpperCase() + handle.slice(1) }).returning())[0].id;
  ids.amara = await mk("amara");
  ids.mei = await mk("mei");
  ids.guest = await mk("hana");
  const [p] = await db.insert(s.projects).values({ slug: "tide", name: "Tide", engine: "godot", ownerId: ids.amara }).returning();
  ids.project = p.id;
  await db.insert(s.memberships).values([
    { projectId: p.id, userId: ids.amara, role: "owner" },
    { projectId: p.id, userId: ids.mei, role: "member" },
    { projectId: p.id, userId: ids.guest, role: "guest" },
  ]);
  await createDefaultChannels(db, p.id);
  ids.channel = (await channelByName(db, p.id, "general"))!.id;
});
afterAll(async () => client.end());

const noop = () => {};

describe("huddle lifecycle", () => {
  let huddleId = "";

  it("allows one live huddle per channel", async () => {
    const [a, b] = await Promise.all([startHuddle(db, ids.channel, ids.amara, noop), startHuddle(db, ids.channel, ids.mei, noop)]);
    expect(a.huddle.id).toBe(b.huddle.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    huddleId = a.huddle.id;
    const posts = await db.select().from(s.messages).where(eq(s.messages.threadKey, `huddle:${huddleId}`));
    expect(posts).toHaveLength(1);
    expect(posts[0].card).toMatchObject({ kind: "huddle", state: "live", url: `/huddle/${huddleId}` });
  });

  it("counts connections so a second tab isn't a leave", async () => {
    await connect(db, huddleId, ids.amara);
    await connect(db, huddleId, ids.amara);
    await connect(db, huddleId, ids.mei);
    expect((await activeParticipants(db, huddleId)).map((p) => p.handle)).toEqual(["amara", "mei"]);
    expect(await disconnect(db, huddleId, ids.amara)).toBe(2);
    expect(await disconnect(db, huddleId, ids.amara)).toBe(1);
    await connect(db, huddleId, ids.amara);
    expect(await activeParticipants(db, huddleId)).toHaveLength(2);
  });

  it("ends once, falls back to rules when the AI fails, and posts a recap", async () => {
    await db.insert(s.huddleCaptions).values([
      { huddleId, userId: ids.mei, text: "I'll fix the dock shader tonight" },
      { huddleId, userId: ids.amara, text: "We decided to ship the storm level first" },
    ]);
    await db.update(s.huddles).set({ notes: "TODO @hana send the capsule art\nTODO @amara update the GDD" }).where(eq(s.huddles.id, huddleId));
    const failing = async () => {
      throw new Error("boom");
    };
    const [r1, r2] = await Promise.all([endHuddle(db, huddleId, failing, noop), endHuddle(db, huddleId, failing, noop)]);
    const recap = r1 ?? r2;
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
    expect(recap!.source).toBe("rules");
    expect(recap!.actions.map((a) => a.owner)).toEqual([null, "amara", "mei"]);
    expect(await activeHuddle(db, ids.channel)).toBeNull();
    expect(await activeParticipants(db, huddleId)).toHaveLength(0);
    const [start] = await db.select().from(s.messages).where(eq(s.messages.threadKey, `huddle:${huddleId}`));
    expect(start.card).toMatchObject({ state: "ended", title: "Huddle ended" });
    const [recapMsg] = await db.select().from(s.messages).where(eq(s.messages.threadKey, `huddle-recap:${huddleId}`));
    expect(recapMsg.body).toMatch(/^📝 Huddle recap/);
    expect(recapMsg.card!.lines).toContain("☐ Fix the dock shader tonight (@mei)");
  });

  it("turns chosen actions into tasks once, never assigning guests", async () => {
    const [h] = await db.select().from(s.huddles).where(eq(s.huddles.id, huddleId));
    const guestIdx = h.recap!.actions.findIndex((a) => a.title.includes("capsule"));
    const meiIdx = h.recap!.actions.findIndex((a) => a.owner === "mei");
    expect(await createRecapTasks(db, huddleId, [guestIdx, meiIdx, meiIdx], "Amara")).toBe(2);
    expect(await createRecapTasks(db, huddleId, [meiIdx], "Amara")).toBe(0);
    const rows = await db.select().from(s.tasks).where(eq(s.tasks.projectId, ids.project));
    expect(rows.find((t) => t.title.includes("dock shader"))!.assigneeId).toBe(ids.mei);
    expect(rows.find((t) => t.title.includes("capsule"))!.assigneeId).toBeNull();
    const [after] = await db.select().from(s.huddles).where(eq(s.huddles.id, huddleId));
    expect(after.recap!.actions.filter((a) => a.taskId)).toHaveLength(2);
  });

  it("uses the AI recap when it succeeds", async () => {
    const { huddle } = await startHuddle(db, ids.channel, ids.mei, noop);
    await connect(db, huddle.id, ids.mei);
    await db.update(s.huddles).set({ notes: "some notes" }).where(eq(s.huddles.id, huddle.id));
    const recap = await endHuddle(db, huddle.id, async () => ({ summary: "AI summary", decisions: ["Ship it"], actions: [], source: "ai" }), noop);
    expect(recap).toMatchObject({ summary: "AI summary", source: "ai" });
  });
});
