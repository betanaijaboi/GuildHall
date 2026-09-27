import "server-only";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { dayKey, isBot, visitorHash } from "@/lib/analytics";

/** Secret salt for visitor hashes. Set ANALYTICS_SALT in production so uniques survive restarts. */
const salt = process.env.ANALYTICS_SALT || env.github.webhookSecret || "guildhall-dev-analytics-salt";

/** The hashed visitor for today, or null for bots. Signed-in visitors are identified by user id. */
export function visitorFor(req: NextRequest, userId: string | null, now = new Date()): { day: string; hash: string } | null {
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const day = dayKey(now);
  return { day, hash: visitorHash(salt, day, userId ? `u:${userId}` : `a:${ip}|${ua}`) };
}

export const ownHost = () => {
  try {
    return new URL(env.appUrl).hostname;
  } catch {
    return "localhost";
  }
};
