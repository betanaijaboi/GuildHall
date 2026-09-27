import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { assets, assetShares, channelAccess, channelLinks, channels, channelShareCodes, guestInvites, memberships, projects, users } from "@/db/schema";
import { postMessage } from "@/lib/messages";

/**
 * Guests and shared channels (C15). Outsiders — a publisher, an outsourcer, a porting partner,
 * a localiser — join through an invite link that grants chosen channels and chosen assets only,
 * never the whole workspace or the repo. Two projects can share one channel via a one-time code.
 * Invite tokens and share codes are stored hashed; the plain value is shown once.
 */

export const INVITE_MAX_DAYS = 30;
export const SHARE_CODE_HOURS = 48;

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// No 0/O, 1/I/L: codes get read out on calls.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newShareCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `GH-${pick()}-${pick()}`;
}

/** Codes are typed by people: ignore case, spaces and missing dashes. */
export function normaliseShareCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^GH/, "");
  return raw.length === 8 ? `GH-${raw.slice(0, 4)}-${raw.slice(4)}` : input.trim().toUpperCase();
}

export type InviteSpec = {
  projectId: string;
  label: string;
  channelIds: string[];
  assetIds: string[];
  maxUses: number;
  days: number;
  createdBy: string;
};

/** Create an invite; returns the plain token (shown once). Grants are checked against the project. */
export async function createInvite(db: Db, spec: InviteSpec): Promise<string> {
  const channelIds = [...new Set(spec.channelIds)];
  const assetIds = [...new Set(spec.assetIds)];
  if (!channelIds.length && !assetIds.length) throw new Error("Pick at least one channel or asset to share");
  if (channelIds.length) {
    const own = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.projectId, spec.projectId), inArray(channels.id, channelIds)));
    if (own.length !== channelIds.length) throw new Error("Guests can only be given this project's own channels");
  }
  if (assetIds.length) {
    const own = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, spec.projectId), inArray(assets.id, assetIds)));
    if (own.length !== assetIds.length) throw new Error("Unknown asset");
  }
  const days = Math.min(Math.max(1, Math.floor(spec.days)), INVITE_MAX_DAYS);
  const token = newInviteToken();
  await db.insert(guestInvites).values({
    tokenHash: hashSecret(token),
    projectId: spec.projectId,
    label: spec.label.trim().slice(0, 80) || "Guest",
    channelIds,
    assetIds,
    maxUses: Math.min(Math.max(1, Math.floor(spec.maxUses)), 50),
    expiresAt: new Date(Date.now() + days * 86_400_000),
    createdBy: spec.createdBy,
  });
  return token;
}

export type InvitePreview = {
  project: { id: string; slug: string; name: string };
  label: string;
  channels: string[];
  assets: string[];
  expiresAt: Date;
  usable: boolean;
};

export async function previewInvite(db: Db, token: string): Promise<InvitePreview | null> {
  const [row] = await db
    .select({ invite: guestInvites, project: { id: projects.id, slug: projects.slug, name: projects.name } })
    .from(guestInvites)
    .innerJoin(projects, eq(projects.id, guestInvites.projectId))
    .where(eq(guestInvites.tokenHash, hashSecret(token)))
    .limit(1);
  if (!row) return null;
  const { invite } = row;
  const [chs, ass] = await Promise.all([
    invite.channelIds.length ? db.select({ name: channels.name }).from(channels).where(inArray(channels.id, invite.channelIds)) : [],
    invite.assetIds.length ? db.select({ title: assets.title }).from(assets).where(inArray(assets.id, invite.assetIds)) : [],
  ]);
  return {
    project: row.project,
    label: invite.label,
    channels: chs.map((c) => c.name),
    assets: ass.map((a) => a.title),
    expiresAt: invite.expiresAt,
    usable: invite.expiresAt > new Date() && invite.uses < invite.maxUses,
  };
}

export type AcceptResult = { slug: string; alreadyMember: boolean };

/**
 * Accept an invite. Uses are claimed atomically so a link can't be over-used by racing clicks.
 * Existing team members are never downgraded; existing guests get the extra grants.
 */
export async function acceptInvite(db: Db, token: string, userId: string): Promise<AcceptResult> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const hash = hashSecret(token);
    const [peek] = await t.select({ projectId: guestInvites.projectId }).from(guestInvites).where(eq(guestInvites.tokenHash, hash)).limit(1);
    if (!peek) throw new Error("This invite link isn't valid");
    const [project] = await t.select().from(projects).where(eq(projects.id, peek.projectId)).limit(1);
    const [existing] = await t.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.projectId, project.id), eq(memberships.userId, userId))).limit(1);
    if (existing && existing.role !== "guest") return { slug: project.slug, alreadyMember: true };

    const [invite] = await t
      .update(guestInvites)
      .set({ uses: sql`${guestInvites.uses} + 1` })
      .where(and(eq(guestInvites.tokenHash, hash), lt(guestInvites.uses, guestInvites.maxUses), gt(guestInvites.expiresAt, sql`now()`)))
      .returning();
    if (!invite) throw new Error("This invite has expired or been used up. Ask for a new link.");

    if (!existing) await t.insert(memberships).values({ projectId: project.id, userId, role: "guest" }).onConflictDoNothing();
    // Only grants that still exist in this project (channels/assets may have been deleted since).
    const chs = invite.channelIds.length
      ? await t.select().from(channels).where(and(eq(channels.projectId, project.id), inArray(channels.id, invite.channelIds)))
      : [];
    const ass = invite.assetIds.length
      ? await t.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, project.id), inArray(assets.id, invite.assetIds)))
      : [];
    if (chs.length) await t.insert(channelAccess).values(chs.map((c) => ({ channelId: c.id, userId }))).onConflictDoNothing();
    if (ass.length) await t.insert(assetShares).values(ass.map((a) => ({ assetId: a.id, userId }))).onConflictDoNothing();

    if (!existing && chs[0]) {
      const [u] = await t.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      await postMessage(t, { channelId: chs[0].id, authorId: null, body: `👋 ${u?.name ?? "A guest"} joined as a guest (${invite.label}). They can see ${chs.map((c) => `#${c.name}`).join(", ")}${ass.length ? ` and ${ass.length} shared asset${ass.length === 1 ? "" : "s"}` : ""}.` });
    }
    return { slug: project.slug, alreadyMember: false };
  });
}

/** Remove a guest's grants in a project (their membership row is removed by the caller). */
export async function revokeGuestGrants(db: Db, projectId: string, userId: string): Promise<void> {
  const chIds = (await db.select({ id: channels.id }).from(channels).where(eq(channels.projectId, projectId))).map((c) => c.id);
  const asIds = (await db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId))).map((a) => a.id);
  if (chIds.length) await db.delete(channelAccess).where(and(eq(channelAccess.userId, userId), inArray(channelAccess.channelId, chIds)));
  if (asIds.length) await db.delete(assetShares).where(and(eq(assetShares.userId, userId), inArray(assetShares.assetId, asIds)));
}

// --- Shared channels ------------------------------------------------------------------------

/** One-time code a lead gives a partner studio to link one of this project's channels. */
export async function createShareCode(db: Db, channelId: string, createdBy: string): Promise<string> {
  const code = newShareCode();
  await db.insert(channelShareCodes).values({ codeHash: hashSecret(code), channelId, createdBy, expiresAt: new Date(Date.now() + SHARE_CODE_HOURS * 3_600_000) });
  return code;
}

/** Redeem a share code into `projectId`. The code is consumed whether or not the link already existed. */
export async function redeemShareCode(db: Db, input: string, projectId: string, redeemedBy: string): Promise<{ channelName: string; fromProject: string }> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [code] = await t
      .delete(channelShareCodes)
      .where(and(eq(channelShareCodes.codeHash, hashSecret(normaliseShareCode(input))), gt(channelShareCodes.expiresAt, sql`now()`)))
      .returning();
    if (!code) throw new Error("That code isn't valid or has expired");
    const [row] = await t
      .select({ channel: channels, project: projects })
      .from(channels)
      .innerJoin(projects, eq(projects.id, channels.projectId))
      .where(eq(channels.id, code.channelId))
      .limit(1);
    if (!row) throw new Error("That channel no longer exists");
    if (row.channel.projectId === projectId) throw new Error("That channel already belongs to this project");
    const [partner] = await t.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const [who] = await t.select({ name: users.name }).from(users).where(eq(users.id, redeemedBy)).limit(1);
    const inserted = await t.insert(channelLinks).values({ channelId: row.channel.id, projectId }).onConflictDoNothing().returning();
    if (inserted.length) {
      await postMessage(t, { channelId: row.channel.id, authorId: null, body: `🔗 #${row.channel.name} is now shared with ${partner?.name ?? "a partner project"} (linked by ${who?.name ?? "their lead"}). Both teams can read and post here.` });
    }
    return { channelName: row.channel.name, fromProject: row.project.name };
  });
}

/** Either side can stop sharing a channel. */
export async function unlinkChannel(db: Db, channelId: string, projectId: string): Promise<void> {
  const [c] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!c) return;
  // The owner removes every link to its channel; a partner removes only its own link.
  if (c.projectId === projectId) await db.delete(channelLinks).where(eq(channelLinks.channelId, channelId));
  else await db.delete(channelLinks).where(and(eq(channelLinks.channelId, channelId), eq(channelLinks.projectId, projectId)));
}
