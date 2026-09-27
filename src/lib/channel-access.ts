import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { DEFAULT_CHANNELS } from "@/lib/messages";
import { assetShares, channelAccess, channelLinks, channels, memberships, projects } from "@/db/schema";

export type Channel = typeof channels.$inferSelect;
type Role = (typeof memberships.$inferSelect)["role"];

/**
 * Channels a person sees in a project's workspace:
 * - members+ see all of the project's own channels plus channels linked in from partner projects;
 * - guests see only channels they were granted, and never linked channels.
 */
export async function visibleChannels(db: Db, projectId: string, userId: string, role: Role): Promise<(Channel & { sharedFrom: string | null })[]> {
  const own = await db.select().from(channels).where(eq(channels.projectId, projectId));
  if (role === "guest") {
    const granted = new Set((await db.select({ id: channelAccess.channelId }).from(channelAccess).where(eq(channelAccess.userId, userId))).map((r) => r.id));
    return own.filter((c) => granted.has(c.id)).map((c) => ({ ...c, sharedFrom: null }));
  }
  const linked = await db
    .select({ channel: channels, project: projects.name })
    .from(channelLinks)
    .innerJoin(channels, eq(channels.id, channelLinks.channelId))
    .innerJoin(projects, eq(projects.id, channels.projectId))
    .where(eq(channelLinks.projectId, projectId));
  return [...own.map((c) => ({ ...c, sharedFrom: null })), ...linked.map((l) => ({ ...l.channel, sharedFrom: l.project }))];
}

/** Whether a user may read/post in a channel, from any project they belong to. */
export async function canAccessChannel(db: Db, channelId: string, userId: string): Promise<boolean> {
  const [c] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!c) return false;
  const [own] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.projectId, c.projectId), eq(memberships.userId, userId))).limit(1);
  if (own && own.role !== "guest") return true;
  if (own?.role === "guest") {
    const [g] = await db.select().from(channelAccess).where(and(eq(channelAccess.channelId, c.id), eq(channelAccess.userId, userId))).limit(1);
    return Boolean(g);
  }
  const links = await db.select({ projectId: channelLinks.projectId }).from(channelLinks).where(eq(channelLinks.channelId, c.id));
  if (!links.length) return false;
  const [viaPartner] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(inArray(memberships.projectId, links.map((l) => l.projectId)), eq(memberships.userId, userId), ne(memberships.role, "guest")))
    .limit(1);
  return Boolean(viaPartner);
}

export async function sharedAssetIds(db: Db, userId: string): Promise<Set<string>> {
  return new Set((await db.select({ id: assetShares.assetId }).from(assetShares).where(eq(assetShares.userId, userId))).map((r) => r.id));
}

/** Guests only see assets shared with them; everyone else on the project sees all. */
export async function canSeeAsset(db: Db, assetId: string, userId: string, role: Role | null): Promise<boolean> {
  if (!role) return false;
  if (role !== "guest") return true;
  return (await sharedAssetIds(db, userId)).has(assetId);
}

/** URL segment for a channel in a workspace: its name, or `shared-<id>` for a partner's channel (names can clash). */
export function channelSegment(c: { id: string; name: string; sharedFrom: string | null }): string {
  return c.sharedFrom ? `shared-${c.id}` : c.name;
}

/** Default channels first in their canonical order, then custom ones, then shared-in channels. */
export function sortChannels<T extends { name: string; sharedFrom: string | null; createdAt: Date }>(list: T[]): T[] {
  const order = (c: T) => {
    if (c.sharedFrom) return 1000;
    const i = DEFAULT_CHANNELS.findIndex((d) => d.name === c.name);
    return i < 0 ? 99 : i;
  };
  return [...list].sort((a, b) => order(a) - order(b) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** The channel belongs to this project or is linked into it from a partner. */
export async function channelInWorkspace(db: Db, projectId: string, channel: { id: string; projectId: string }): Promise<boolean> {
  if (channel.projectId === projectId) return true;
  const [link] = await db.select().from(channelLinks).where(and(eq(channelLinks.channelId, channel.id), eq(channelLinks.projectId, projectId))).limit(1);
  return Boolean(link);
}
