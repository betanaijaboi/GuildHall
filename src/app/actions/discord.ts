"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { channels, discordLinks, discordWebhooks } from "@/db/schema";
import type { SecretState } from "@/app/actions/guests";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { validWebhookUrl } from "@/lib/discord";
import { createDiscordLinkCode, fetchSender } from "@/lib/discord-db";

const path = (slug: string) => `/p/${slug}/settings/discord`;

export async function createDiscordLinkCodeAction(slug: string, _prev: SecretState, _form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  return { secret: await createDiscordLinkCode(db, project.id) };
}

export async function unlinkDiscord(slug: string): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await db.delete(discordLinks).where(eq(discordLinks.projectId, project.id));
  revalidatePath(path(slug));
}

export async function addDiscordWebhook(slug: string, _prev: SecretState, form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const channelId = z.string().uuid().safeParse(form.get("channelId"));
  const url = validWebhookUrl(String(form.get("url") ?? ""));
  if (!channelId.success) return { error: "Pick a channel" };
  if (!url) return { error: "Paste a Discord webhook URL (Channel settings → Integrations → Webhooks → Copy URL)" };
  const [c] = await db.select().from(channels).where(and(eq(channels.id, channelId.data), eq(channels.projectId, project.id))).limit(1);
  if (!c) return { error: "Pick one of this project's channels" };
  // Check it works before saving, with a short hello.
  const res = await fetchSender(url, { content: `🔗 Guildhall will now mirror #${c.name} from ${project.name} here.`, username: "Guildhall", allowed_mentions: { parse: [] } }).catch(() => ({ status: 0 }));
  if (res.status < 200 || res.status >= 300) return { error: `Discord didn't accept that webhook (${res.status || "network error"}). Check the URL.` };
  await db.insert(discordWebhooks).values({ channelId: c.id, webhookUrl: url, createdBy: user.id }).onConflictDoUpdate({ target: discordWebhooks.channelId, set: { webhookUrl: url, lastError: null } });
  revalidatePath(path(slug));
  return { message: `#${c.name} now mirrors to Discord.` };
}

export async function removeDiscordWebhook(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const channelId = z.string().uuid().parse(form.get("channelId"));
  const [c] = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.id, channelId), eq(channels.projectId, project.id))).limit(1);
  if (c) await db.delete(discordWebhooks).where(eq(discordWebhooks.channelId, c.id));
  revalidatePath(path(slug));
}
