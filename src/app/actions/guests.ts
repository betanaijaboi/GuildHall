"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { channels, guestInvites } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { acceptInvite, createInvite, createShareCode, redeemShareCode, unlinkChannel } from "@/lib/guests";

export type SecretState = { secret?: string; message?: string; error?: string };

const ids = (form: FormData, key: string) => form.getAll(key).map((v) => z.string().uuid().parse(v));

export async function createInviteAction(slug: string, _prev: SecretState, form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  try {
    const token = await createInvite(db, {
      projectId: project.id,
      label: z.string().trim().max(80).parse(form.get("label") ?? ""),
      channelIds: ids(form, "channelId"),
      assetIds: ids(form, "assetId"),
      maxUses: z.coerce.number().int().parse(form.get("maxUses") ?? 1),
      days: z.coerce.number().int().parse(form.get("days") ?? 7),
      createdBy: user.id,
    });
    revalidatePath(`/p/${slug}/settings/sharing`);
    return { secret: token };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function revokeInviteAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const hash = z.string().regex(/^[0-9a-f]{64}$/).parse(form.get("tokenHash"));
  await db.delete(guestInvites).where(and(eq(guestInvites.tokenHash, hash), eq(guestInvites.projectId, project.id)));
  revalidatePath(`/p/${slug}/settings/sharing`);
}

export async function acceptInviteAction(token: string): Promise<void> {
  const user = await requireUser();
  let slug: string;
  try {
    slug = (await acceptInvite(db, z.string().min(20).max(100).parse(token), user.id)).slug;
  } catch {
    // A fixed flag, not the message: the invite page must not render text taken from the URL.
    redirect(`/invite/${encodeURIComponent(token)}?error=1`);
  }
  redirect(`/p/${slug}/workspace`);
}

export async function createShareCodeAction(slug: string, _prev: SecretState, form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const channelId = z.string().uuid().safeParse(form.get("channelId"));
  if (!channelId.success) return { error: "Pick a channel" };
  const [channel] = await db.select().from(channels).where(and(eq(channels.id, channelId.data), eq(channels.projectId, project.id))).limit(1);
  if (!channel) return { error: "Pick one of this project's channels" };
  if (channel.kind === "github") return { error: "The #github feed can't be shared; it mirrors your private repos" };
  return { secret: await createShareCode(db, channel.id, user.id), message: `#${channel.name}` };
}

export async function redeemShareCodeAction(slug: string, _prev: SecretState, form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  try {
    const r = await redeemShareCode(db, z.string().max(40).parse(form.get("code") ?? ""), project.id, user.id);
    revalidatePath(`/p/${slug}`, "layout");
    return { message: `Linked #${r.channelName} from ${r.fromProject}. It's in your Chat sidebar now.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function unlinkChannelAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await unlinkChannel(db, z.string().uuid().parse(form.get("channelId")), project.id);
  revalidatePath(`/p/${slug}`, "layout");
}
