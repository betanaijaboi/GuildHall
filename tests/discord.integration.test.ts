import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { createDiscordLinkCode, forwardMessage, handleInteraction } from "@/lib/discord-db";
import { channelByName, createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
let projectId = "";
type Member = { permissions: string; user: { id: string; username: string; global_name?: string } };
type Reply = { type: number; data: { content: string; flags: number } };
const admin: Member = { permissions: String(1 << 5), user: { id: "1", username: "mod", global_name: "Mod" } };
const player: Member = { permissions: "0", user: { id: "2", username: "sam" } };
const cmd = async (name: string, options: unknown[] = [], member: Member = player, guild = "g1") =>
  (await handleInteraction(db, { type: 2, guild_id: guild, member, data: { name, options: options as never } }, "https://gh.io")) as Reply;

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  const [u] = await db.insert(s.users).values({ handle: "lead", name: "Lead" }).returning();
  [{ id: projectId }] = await db.insert(s.projects).values({ slug: "tide", name: "Tide", engine: "godot", ownerId: u.id }).returning();
  await createDefaultChannels(db, projectId);
  await db.insert(s.roadmapItems).values([{ projectId, title: "Co-op", column: "next" }, { projectId, title: "Secret", column: "now", public: false }]);
});
afterAll(async () => client.end());

describe("Discord interactions", () => {
  it("answers PING and asks unlinked servers to link", async () => {
    expect(await handleInteraction(db, { type: 1 }, "x")).toEqual({ type: 1 });
    expect((await cmd("bug", [{ type: 3, name: "title", value: "x" }])).data.content).toMatch(/isn't linked/);
  });

  it("links only with Manage Server and a valid one-time code", async () => {
    const code = await createDiscordLinkCode(db, projectId);
    const link = (member: Member, c = code) => cmd("guildhall", [{ type: 1, name: "link", options: [{ type: 3, name: "code", value: c }] }], member);
    expect((await link(player)).data.content).toMatch(/Only server admins/);
    expect((await link(admin, "GH-NOPE-NOPE")).data.content).toMatch(/isn't valid/);
    expect((await link(admin, code.toLowerCase())).data.content).toMatch(/Linked to \*\*Tide\*\*/);
    expect((await link(admin)).data.content).toMatch(/isn't valid/);
  });

  it("files bugs, feedback and ideas into the inbox and shows the public roadmap", async () => {
    expect((await cmd("bug", [{ type: 3, name: "title", value: "Boat sinks" }, { type: 3, name: "details", value: "At the dock" }])).data.flags).toBe(64);
    await cmd("feedback", [{ type: 3, name: "text", value: "Love the storms\nmore please" }]);
    await cmd("idea", [{ type: 3, name: "title", value: "Fishing" }]);
    const reports = await db.select().from(s.feedbackReports).where(eq(s.feedbackReports.projectId, projectId));
    expect(reports.map((r) => [r.source, r.kind, r.title, r.reporterName])).toEqual(expect.arrayContaining([
      ["discord", "bug", "Boat sinks", "sam (Discord)"],
      ["discord", "feedback", "Love the storms", "sam (Discord)"],
      ["discord", "idea", "Fishing", "sam (Discord)"],
    ]));
    const road = await cmd("roadmap");
    expect(road.data.content).toContain("**Co-op** · Next · ▲0");
    expect(road.data.content).not.toContain("Secret");
    expect(road.data.flags).toBe(0);
  });
});

describe("Discord mirror", () => {
  it("forwards only mirrored channels, retries a rate limit once, and records dead webhooks", async () => {
    const general = (await channelByName(db, projectId, "general"))!;
    const builds = (await channelByName(db, projectId, "builds"))!;
    await db.insert(s.discordWebhooks).values({ channelId: general.id, webhookUrl: "https://discord.com/api/webhooks/1/x" });
    const [m1] = await db.insert(s.messages).values({ channelId: general.id, body: "hello @everyone" }).returning();
    const [m2] = await db.insert(s.messages).values({ channelId: builds.id, body: "not mirrored" }).returning();
    const calls: unknown[] = [];
    let first = true;
    const sender = async (_u: string, body: unknown) => {
      calls.push(body);
      if (first) return (first = false), { status: 429, retryAfter: 0 };
      return { status: 204 };
    };
    expect(await forwardMessage(db, m1.id, sender, async () => {})).toBe("sent");
    expect(calls).toHaveLength(2);
    expect((calls[1] as { content: string }).content).toBe("hello @\u200beveryone");
    expect(await forwardMessage(db, m2.id, sender, async () => {})).toBe("skipped");
    expect(await forwardMessage(db, m1.id, async () => ({ status: 404 }), async () => {})).toBe("failed");
    const [hook] = await db.select().from(s.discordWebhooks);
    expect(hook.lastError).toMatch(/deleted/);
  });
});
