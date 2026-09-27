import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { canAccessChannel, canSeeAsset, channelInWorkspace, visibleChannels } from "@/lib/channel-access";
import { acceptInvite, createInvite, createShareCode, previewInvite, redeemShareCode, revokeGuestGrants, unlinkChannel } from "@/lib/guests";
import { channelByName, createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const ids = { lead: "", member: "", guest: "", guest2: "", partner: "", studio: "", partnerProject: "", art: "", secret: "" };

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
  const mk = async (handle: string) => (await db.insert(s.users).values({ handle, name: handle.toUpperCase() }).returning())[0].id;
  ids.lead = await mk("lead");
  ids.member = await mk("member");
  ids.guest = await mk("guest");
  ids.guest2 = await mk("guest2");
  ids.partner = await mk("partner");
  const [p] = await db.insert(s.projects).values({ slug: "studio", name: "Studio", engine: "godot", ownerId: ids.lead }).returning();
  const [q] = await db.insert(s.projects).values({ slug: "partner", name: "Partner Co", engine: "unity", ownerId: ids.partner }).returning();
  ids.studio = p.id;
  ids.partnerProject = q.id;
  await db.insert(s.memberships).values([
    { projectId: p.id, userId: ids.lead, role: "owner" },
    { projectId: p.id, userId: ids.member, role: "member" },
    { projectId: q.id, userId: ids.partner, role: "owner" },
  ]);
  await createDefaultChannels(db, p.id);
  await createDefaultChannels(db, q.id);
  const [a1] = await db.insert(s.assets).values({ projectId: p.id, title: "Hero concept", kind: "image", createdBy: ids.member }).returning();
  const [a2] = await db.insert(s.assets).values({ projectId: p.id, title: "Secret boss", kind: "image", createdBy: ids.member }).returning();
  ids.art = a1.id;
  ids.secret = a2.id;
});
afterAll(async () => client.end());

const ch = async (projectId: string, name: string) => (await channelByName(db, projectId, name))!;

describe("guest invites", () => {
  it("only accept the project's own channels and assets", async () => {
    const other = await ch(ids.partnerProject, "general");
    await expect(createInvite(db, { projectId: ids.studio, label: "x", channelIds: [other.id], assetIds: [], maxUses: 1, days: 7, createdBy: ids.lead })).rejects.toThrow(/own channels/);
    await expect(createInvite(db, { projectId: ids.studio, label: "x", channelIds: [], assetIds: [], maxUses: 1, days: 7, createdBy: ids.lead })).rejects.toThrow(/at least one/);
  });

  it("grant exactly the chosen channels and assets, and nothing else", async () => {
    const art = await ch(ids.studio, "art");
    const general = await ch(ids.studio, "general");
    const token = await createInvite(db, { projectId: ids.studio, label: "Publisher", channelIds: [art.id], assetIds: [ids.art], maxUses: 1, days: 7, createdBy: ids.lead });
    const preview = await previewInvite(db, token);
    expect(preview).toMatchObject({ label: "Publisher", channels: ["art"], assets: ["Hero concept"], usable: true });
    const stored = await db.select().from(s.guestInvites);
    expect(stored.some((i) => i.tokenHash === token)).toBe(false);

    await acceptInvite(db, token, ids.guest);
    const [m] = await db.select().from(s.memberships).where(eq(s.memberships.userId, ids.guest));
    expect(m.role).toBe("guest");
    expect((await visibleChannels(db, ids.studio, ids.guest, "guest")).map((c) => c.name)).toEqual(["art"]);
    expect(await canAccessChannel(db, art.id, ids.guest)).toBe(true);
    expect(await canAccessChannel(db, general.id, ids.guest)).toBe(false);
    expect(await canSeeAsset(db, ids.art, ids.guest, "guest")).toBe(true);
    expect(await canSeeAsset(db, ids.secret, ids.guest, "guest")).toBe(false);
    expect(await canSeeAsset(db, ids.secret, ids.member, "member")).toBe(true);
    // The team hears about it in the granted channel.
    const msgs = await db.select().from(s.messages).where(eq(s.messages.channelId, art.id));
    expect(msgs.some((x) => x.body.includes("joined as a guest (Publisher)"))).toBe(true);

    // Single-use: a second person can't use it.
    expect((await previewInvite(db, token))!.usable).toBe(false);
    await expect(acceptInvite(db, token, ids.guest2)).rejects.toThrow(/expired or been used up/);
  });

  it("claims uses atomically under concurrent accepts", async () => {
    const art = await ch(ids.studio, "art");
    const token = await createInvite(db, { projectId: ids.studio, label: "Race", channelIds: [art.id], assetIds: [], maxUses: 1, days: 7, createdBy: ids.lead });
    const u1 = (await db.insert(s.users).values({ handle: "r1", name: "R1" }).returning())[0].id;
    const u2 = (await db.insert(s.users).values({ handle: "r2", name: "R2" }).returning())[0].id;
    const results = await Promise.allSettled([acceptInvite(db, token, u1), acceptInvite(db, token, u2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("never downgrades an existing team member", async () => {
    const art = await ch(ids.studio, "art");
    const token = await createInvite(db, { projectId: ids.studio, label: "x", channelIds: [art.id], assetIds: [], maxUses: 1, days: 7, createdBy: ids.lead });
    expect(await acceptInvite(db, token, ids.member)).toMatchObject({ alreadyMember: true });
    const [m] = await db.select().from(s.memberships).where(eq(s.memberships.userId, ids.member));
    expect(m.role).toBe("member");
    expect((await previewInvite(db, token))!.usable).toBe(true);
  });

  it("rejects expired invites", async () => {
    const art = await ch(ids.studio, "art");
    const token = await createInvite(db, { projectId: ids.studio, label: "old", channelIds: [art.id], assetIds: [], maxUses: 3, days: 1, createdBy: ids.lead });
    await db.update(s.guestInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.guestInvites.label, "old"));
    await expect(acceptInvite(db, token, ids.guest2)).rejects.toThrow(/expired/);
  });

  it("removing a guest drops their grants", async () => {
    await revokeGuestGrants(db, ids.studio, ids.guest);
    expect(await canSeeAsset(db, ids.art, ids.guest, "guest")).toBe(false);
    expect(await canAccessChannel(db, (await ch(ids.studio, "art")).id, ids.guest)).toBe(false);
  });
});

describe("shared channels", () => {
  it("link one channel between two projects with a one-time code", async () => {
    const shared = await ch(ids.studio, "art");
    const code = await createShareCode(db, shared.id, ids.lead);
    await expect(redeemShareCode(db, code, ids.studio, ids.lead)).rejects.toThrow(/already belongs/);
    // A failed redeem rolls back, so the code still works for the real partner.
    const code2 = code;
    const r = await redeemShareCode(db, code2.toLowerCase().replace(/-/g, " "), ids.partnerProject, ids.partner);
    expect(r).toEqual({ channelName: "art", fromProject: "Studio" });
    await expect(redeemShareCode(db, code2, ids.partnerProject, ids.partner)).rejects.toThrow(/isn't valid/);

    const seen = await visibleChannels(db, ids.partnerProject, ids.partner, "owner");
    expect(seen.find((c) => c.id === shared.id)?.sharedFrom).toBe("Studio");
    expect(await canAccessChannel(db, shared.id, ids.partner)).toBe(true);
    expect(await canAccessChannel(db, (await ch(ids.studio, "general")).id, ids.partner)).toBe(false);
    expect(await channelInWorkspace(db, ids.partnerProject, shared)).toBe(true);
    expect(await channelInWorkspace(db, ids.partnerProject, await ch(ids.studio, "general"))).toBe(false);
  });

  it("partner guests don't get shared channels", async () => {
    const shared = await ch(ids.studio, "art");
    await db.insert(s.memberships).values({ projectId: ids.partnerProject, userId: ids.guest2, role: "guest" });
    expect(await canAccessChannel(db, shared.id, ids.guest2)).toBe(false);
    expect((await visibleChannels(db, ids.partnerProject, ids.guest2, "guest")).length).toBe(0);
  });

  it("either side can stop sharing", async () => {
    const shared = await ch(ids.studio, "art");
    await unlinkChannel(db, shared.id, ids.partnerProject);
    expect(await canAccessChannel(db, shared.id, ids.partner)).toBe(false);
  });
});
