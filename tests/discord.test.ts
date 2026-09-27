import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canManageGuild, formatForDiscord, readOptions, validWebhookUrl, verifyDiscordSignature } from "@/lib/discord";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubHex = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex");
const signed = (ts: string, body: string) => sign(null, Buffer.from(ts + body), privateKey).toString("hex");

describe("Discord signatures", () => {
  const now = 1_790_000_000_000;
  const ts = String(now / 1000);
  it("accepts a valid signature and rejects tampering, wrong keys and replays", () => {
    const body = '{"type":1}';
    expect(verifyDiscordSignature(pubHex, signed(ts, body), ts, body, now)).toBe(true);
    expect(verifyDiscordSignature(pubHex, signed(ts, body), ts, '{"type":2}', now)).toBe(false);
    const other = Buffer.from(generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex");
    expect(verifyDiscordSignature(other, signed(ts, body), ts, body, now)).toBe(false);
    expect(verifyDiscordSignature(pubHex, signed(ts, body), ts, body, now + 10 * 60_000)).toBe(false);
    expect(verifyDiscordSignature("", "", ts, body, now)).toBe(false);
    expect(verifyDiscordSignature(pubHex, "zz", ts, body, now)).toBe(false);
  });
});

describe("webhooks and formatting", () => {
  it("only accepts Discord channel webhook URLs", () => {
    expect(validWebhookUrl("https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklmnopqrstuvwxyz")).toBe("https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklmnopqrstuvwxyz");
    expect(validWebhookUrl("https://discordapp.com/api/webhooks/123456789012345678/abcDEF_ghi-jklmnopqrstuvwxyz")).toMatch(/^https:\/\/discord\.com\//);
    expect(validWebhookUrl("https://evil.com/api/webhooks/123456789012345678/abcDEF_ghi-jklmnopqrstuvwxyz")).toBeNull();
    expect(validWebhookUrl("http://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklmnopqrstuvwxyz")).toBeNull();
    expect(validWebhookUrl("https://discord.com/api/webhooks/123/x?wait=true")).toBeNull();
  });
  it("never pings, quotes cards and fits Discord's limits", () => {
    const f = formatForDiscord({ author: "Amara", body: "hey @everyone and @here", card: { title: "v0.4", url: "https://gh/rel", state: "released" }, isReply: true, channel: "builds" });
    expect(f.content).toBe("↳ hey @​everyone and @​here\n> **v0.4** · released\n> <https://gh/rel>");
    expect(f.allowed_mentions).toEqual({ parse: [] });
    expect(f.username).toBe("Amara · #builds");
    expect(formatForDiscord({ author: null, body: "x".repeat(5000), card: null, isReply: false, channel: "c" }).content.length).toBeLessThanOrEqual(2000);
    expect(formatForDiscord({ author: null, body: "x", card: { title: "t", url: "javascript:alert(1)" }, isReply: false, channel: "c" }).content).not.toContain("javascript");
  });
  it("reads options and permissions", () => {
    expect(readOptions([{ type: 1, name: "link", options: [{ type: 3, name: "code", value: "GH-AAAA-BBBB" }] }])).toEqual({ sub: "link", values: { code: "GH-AAAA-BBBB" } });
    expect(readOptions([{ type: 3, name: "title", value: "Crash" }])).toEqual({ sub: null, values: { title: "Crash" } });
    expect(canManageGuild(String(1 << 5))).toBe(true);
    expect(canManageGuild("8")).toBe(true);
    expect(canManageGuild("2048")).toBe(false);
    expect(canManageGuild("nope")).toBe(false);
  });
});
