import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { channels, discordLinkCodes, discordLinks, discordWebhooks, messages, projects, roadmapItems, roadmapVotes, users } from "@/db/schema";
import { canManageGuild, EPHEMERAL, formatForDiscord, readOptions, type Option } from "@/lib/discord";
import { hashSecret, newShareCode, normaliseShareCode } from "@/lib/guests";
import { ingestSdkReport } from "@/lib/feedback-db";
import { canVote } from "@/lib/roadmap";

export async function createDiscordLinkCode(db: Db, projectId: string): Promise<string> {
  const code = newShareCode();
  await db.insert(discordLinkCodes).values({ codeHash: hashSecret(code), projectId, expiresAt: new Date(Date.now() + 30 * 60_000) });
  return code;
}

export type Interaction = {
  type: number;
  guild_id?: string;
  data?: { name: string; options?: Option[] };
  member?: { permissions?: string; nick?: string | null; user?: { id: string; username: string; global_name?: string | null } };
  user?: { id: string; username: string; global_name?: string | null };
};

const reply = (content: string, ephemeral = true) => ({ type: 4, data: { content: content.slice(0, 1990), flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] as string[] } } });

/** Answer a verified Discord interaction. PING → PONG; commands act on the project linked to the server. */
export async function handleInteraction(db: Db, i: Interaction, appUrl: string) {
  if (i.type === 1) return { type: 1 };
  if (i.type !== 2 || !i.data) return reply("Unsupported interaction.");
  if (!i.guild_id) return reply("Use Guildhall commands inside a server.");
  const who = i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || "Discord user";
  const { sub, values } = readOptions(i.data.options);

  if (i.data.name === "guildhall" && sub === "link") {
    if (!canManageGuild(i.member?.permissions)) return reply("Only server admins (Manage Server) can link Guildhall.");
    const [code] = await db.delete(discordLinkCodes).where(and(eq(discordLinkCodes.codeHash, hashSecret(normaliseShareCode(values.code ?? ""))), gt(discordLinkCodes.expiresAt, new Date()))).returning();
    if (!code) return reply("That code isn't valid or has expired. Get a new one in the project's Discord settings.");
    const [existing] = await db.select().from(discordLinks).where(eq(discordLinks.guildId, i.guild_id)).limit(1);
    if (existing && existing.projectId !== code.projectId) return reply("This server is already linked to another Guildhall project. Unlink it there first.");
    await db.insert(discordLinks).values({ projectId: code.projectId, guildId: i.guild_id, linkedBy: who }).onConflictDoUpdate({ target: discordLinks.projectId, set: { guildId: i.guild_id, linkedBy: who } });
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, code.projectId)).limit(1);
    return reply(`✅ Linked to **${p?.name ?? "the project"}** on Guildhall. Players can now use /bug, /feedback, /idea and /roadmap.`, false);
  }

  const [link] = await db.select({ link: discordLinks, project: projects }).from(discordLinks).innerJoin(projects, eq(projects.id, discordLinks.projectId)).where(eq(discordLinks.guildId, i.guild_id)).limit(1);
  if (!link) return reply("This server isn't linked to a Guildhall project yet. An admin can run /guildhall link.");
  const projectId = link.project.id;

  if (i.data.name === "bug" || i.data.name === "feedback" || i.data.name === "idea") {
    const kind = i.data.name;
    const title = (kind === "feedback" ? (values.text ?? "").split("\n")[0] : values.title ?? "").trim().slice(0, 160);
    if (!title) return reply("Please include some text.");
    await ingestSdkReport(db, projectId, {
      kind,
      title,
      description: (kind === "bug" ? values.details : kind === "idea" ? values.why : values.text) ?? "",
      build: "",
      platform: "Discord",
      player: `${who} (Discord)`,
      source: "discord",
    });
    return reply(kind === "bug" ? "🐞 Thanks! Your bug report went to the dev team." : kind === "idea" ? "💡 Thanks! Your idea went to the dev team." : "💬 Thanks! Your feedback went to the dev team.");
  }

  if (i.data.name === "roadmap") {
    const items = await db.select().from(roadmapItems).where(and(eq(roadmapItems.projectId, projectId), eq(roadmapItems.public, true)));
    const open = items.filter((x) => canVote(x.column));
    const votes = open.length ? await db.select({ id: roadmapVotes.itemId, n: count() }).from(roadmapVotes).where(inArray(roadmapVotes.itemId, open.map((x) => x.id))).groupBy(roadmapVotes.itemId) : [];
    const n = new Map(votes.map((v) => [v.id, v.n]));
    const top = open.sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0)).slice(0, 5);
    const label = { now: "Now", next: "Next", later: "Later", shipped: "Shipped" } as const;
    const lines = top.map((x) => `• **${x.title}** · ${label[x.column]} · ▲${n.get(x.id) ?? 0}`);
    return reply(`🗺️ **${link.project.name} roadmap**\n${lines.join("\n") || "Nothing on the roadmap yet."}\nVote: <${appUrl}/p/${link.project.slug}/roadmap>`, false);
  }
  return reply("Unknown command.");
}

// --- Outbound mirror ---------------------------------------------------------------------------------------

export type Sender = (url: string, body: unknown) => Promise<{ status: number; retryAfter?: number }>;

export const fetchSender: Sender = async (url, body) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const retryAfter = res.status === 429 ? Number((await res.json().catch(() => ({})) as { retry_after?: number }).retry_after ?? 1) : undefined;
  return { status: res.status, retryAfter };
};

/** Mirror one Guildhall message into Discord if its channel has a webhook. Retries once on rate limit. */
export async function forwardMessage(db: Db, messageId: string, send: Sender = fetchSender, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<"sent" | "skipped" | "failed"> {
  const [row] = await db
    .select({ m: messages, hook: discordWebhooks, channel: channels.name, author: users.name })
    .from(messages)
    .innerJoin(discordWebhooks, eq(discordWebhooks.channelId, messages.channelId))
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!row) return "skipped";
  const payload = formatForDiscord({ author: row.author, body: row.m.title ? `**${row.m.title}**\n${row.m.body}` : row.m.body, card: row.m.card ?? null, isReply: Boolean(row.m.threadRootId), channel: row.channel });
  let res = await send(row.hook.webhookUrl, payload);
  if (res.status === 429) {
    await sleep(Math.min(10, res.retryAfter ?? 1) * 1000);
    res = await send(row.hook.webhookUrl, payload);
  }
  const ok = res.status >= 200 && res.status < 300;
  await db
    .update(discordWebhooks)
    .set(ok ? { lastSentAt: new Date(), lastError: null } : { lastError: res.status === 404 || res.status === 401 ? "The Discord webhook was deleted. Add a new one." : `Discord returned ${res.status}` })
    .where(eq(discordWebhooks.channelId, row.hook.channelId));
  return ok ? "sent" : "failed";
}

export async function recentLinks(db: Db, projectId: string) {
  return db.select({ hook: discordWebhooks, channel: channels.name }).from(discordWebhooks).innerJoin(channels, eq(channels.id, discordWebhooks.channelId)).where(eq(channels.projectId, projectId)).orderBy(asc(channels.name)).limit(50);
}
