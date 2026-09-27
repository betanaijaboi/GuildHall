import { createPublicKey, verify } from "node:crypto";

/**
 * Discord bridge (C21). Outbound: Guildhall channels mirror into Discord via channel webhooks.
 * Inbound: slash commands (an HTTP interactions endpoint, no gateway bot needed) let a community
 * file bugs, feedback and ideas into the project's inbox and see the roadmap.
 */

export const MANAGE_GUILD = BigInt(1 << 5);
export const EPHEMERAL = 64;

/** Discord signs every interaction with Ed25519 over `timestamp + body`. */
export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string, now = Date.now()): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false; // replay window
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** Only real Discord channel webhooks: https://discord.com/api/webhooks/<id>/<token>. */
export function validWebhookUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(u.hostname)) return null;
  if (!/^\/api(\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]{20,120}$/.test(u.pathname) || u.search || u.hash) return null;
  return `https://discord.com${u.pathname}`;
}

export const maskWebhook = (url: string) => url.replace(/\/[\w-]+$/, "/••••••");

type Card = { title: string; url?: string; state?: string } | null;

/** A Discord webhook payload for a Guildhall message. Mentions are never parsed (no @everyone pings). */
export function formatForDiscord(m: { author: string | null; body: string; card: Card; isReply: boolean; channel: string }) {
  const lines = [m.isReply ? `↳ ${m.body}` : m.body];
  if (m.card) lines.push(`> **${m.card.title}**${m.card.state ? ` · ${m.card.state.replaceAll("_", " ")}` : ""}${m.card.url && /^https:\/\//.test(m.card.url) ? `\n> <${m.card.url}>` : ""}`);
  const content = lines.join("\n").replace(/@(everyone|here)/g, "@​$1").slice(0, 1990);
  return { content, username: `${m.author ?? "Guildhall"} · #${m.channel}`.slice(0, 80), allowed_mentions: { parse: [] as string[] } };
}

export type Option = { name: string; type: number; value?: string | number | boolean; options?: Option[] };

/** Flatten a command's options (including one subcommand level) into name → value. */
export function readOptions(options: Option[] | undefined): { sub: string | null; values: Record<string, string> } {
  const first = options?.[0];
  const list = first && first.type === 1 ? first.options ?? [] : options ?? [];
  return { sub: first?.type === 1 ? first.name : null, values: Object.fromEntries(list.filter((o) => o.value !== undefined).map((o) => [o.name, String(o.value)])) };
}

export const canManageGuild = (permissions: string | undefined) => {
  try {
    return permissions ? (BigInt(permissions) & MANAGE_GUILD) === MANAGE_GUILD || (BigInt(permissions) & BigInt(8)) === BigInt(8) : false;
  } catch {
    return false;
  }
};

/** Slash command definitions registered with Discord (scripts/discord-register.ts). */
export const COMMANDS = [
  { name: "guildhall", description: "Guildhall project link", options: [{ type: 1, name: "link", description: "Link this server to a Guildhall project", options: [{ type: 3, name: "code", description: "Code from the project's Discord settings", required: true }] }] },
  { name: "bug", description: "Report a bug to the dev team", options: [{ type: 3, name: "title", description: "What went wrong?", required: true, max_length: 160 }, { type: 3, name: "details", description: "Steps, build, platform", max_length: 2000 }] },
  { name: "feedback", description: "Send feedback to the dev team", options: [{ type: 3, name: "text", description: "Your feedback", required: true, max_length: 2000 }] },
  { name: "idea", description: "Suggest an idea", options: [{ type: 3, name: "title", description: "Your idea", required: true, max_length: 160 }, { type: 3, name: "why", description: "Why would it make the game better?", max_length: 2000 }] },
  { name: "roadmap", description: "See what the team is working on" },
] as const;
