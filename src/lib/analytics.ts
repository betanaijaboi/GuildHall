import { createHmac } from "node:crypto";

/** Profile and project analytics (C23): privacy-friendly daily uniques, sources and click-throughs. */

export const RETENTION_DAYS = 400;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python-requests|axios|node-fetch/i;
export const isBot = (ua: string | null) => !ua || BOT.test(ua);

/** HMAC(day, visitor): stable within a day for uniques, unlinkable across days, never a raw IP. */
export function visitorHash(salt: string, day: string, visitor: string): string {
  return createHmac("sha256", salt).update(`${day}|${visitor}`).digest("hex").slice(0, 32);
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)bing\.com$|duckduckgo\.com$|search\.brave\.com$/, "Search"],
  [/(^|\.)artstation\.com$/, "ArtStation"],
  [/(^|\.)behance\.net$/, "Behance"],
  [/(^|\.)itch\.io$/, "itch.io"],
  [/(^|\.)discord(app)?\.com$|discord\.gg$/, "Discord"],
  [/(^|\.)(twitter|x)\.com$|t\.co$/, "X / Twitter"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)linkedin\.com$|lnkd\.in$/, "LinkedIn"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)youtube\.com$|youtu\.be$/, "YouTube"],
  [/(^|\.)store\.steampowered\.com$|steamcommunity\.com$/, "Steam"],
];

/** Where a visit came from: a known site, "Guildhall" for internal navigation, another host, or "direct". */
export function sourceOf(referrer: string | null, ownHost: string): string {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (host === ownHost) return "Guildhall";
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return host.replace(/^www\./, "").slice(0, 60);
}

/** Fill a day-by-day series ending today, oldest first. */
export function series(rows: { day: string; value: number }[], days: number, today: Date): { day: string; value: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  return Array.from({ length: days }, (_, i) => {
    const d = dayKey(new Date(today.getTime() - (days - 1 - i) * 86_400_000));
    return { day: d, value: byDay.get(d) ?? 0 };
  });
}

/** An SVG polyline path for a sparkline in a width × height box. */
export function sparkPath(values: number[], width: number, height: number): string {
  if (!values.length) return "";
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(" ");
}

/** Percentage change between the two halves of a window (null when there's nothing to compare). */
export function trend(values: number[]): number | null {
  const half = Math.floor(values.length / 2);
  const before = values.slice(0, half).reduce((a, b) => a + b, 0);
  const after = values.slice(half).reduce((a, b) => a + b, 0);
  if (!before) return after ? null : 0;
  return Math.round(((after - before) / before) * 100);
}
