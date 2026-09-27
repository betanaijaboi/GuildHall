import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PlaytestQuestion } from "@/db/schema";

/**
 * Playtests and player feedback (C8/C9): structured playtest forms and in-game reports land in
 * one inbox, and the team turns them into GitHub issues or tasks.
 */

export const MAX_QUESTIONS = 10;

/**
 * One question per line:
 *   rating: How fun was the core loop?
 *   text: What confused you?
 *   choice: Would you buy it? | Yes | Maybe | No
 */
export function parseQuestions(text: string): PlaytestQuestion[] {
  const out: PlaytestQuestion[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(rating|text|choice)\s*:\s*(.+)$/i.exec(line);
    const kind = (m?.[1].toLowerCase() ?? "text") as PlaytestQuestion["kind"];
    const rest = (m?.[2] ?? line).split("|").map((s) => s.trim()).filter(Boolean);
    const prompt = rest[0]?.slice(0, 200);
    if (!prompt) continue;
    const options = kind === "choice" ? [...new Set(rest.slice(1).map((o) => o.slice(0, 60)))].slice(0, 8) : [];
    if (kind === "choice" && options.length < 2) throw new Error(`"${prompt}" needs at least two options, e.g. choice: ${prompt} | Yes | No`);
    out.push({ id: `q${out.length + 1}`, kind, prompt, options });
    if (out.length > MAX_QUESTIONS) throw new Error(`Up to ${MAX_QUESTIONS} questions`);
  }
  return out;
}

export function questionsToText(qs: PlaytestQuestion[]): string {
  return qs.map((q) => `${q.kind}: ${[q.prompt, ...q.options].join(" | ")}`).join("\n");
}

/** Keep only valid answers: ratings 1–5, choices from the list, text up to 2000 chars. */
export function cleanAnswers(qs: PlaytestQuestion[], input: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const q of qs) {
    const v = input[q.id];
    if (v == null || v === "") continue;
    if (q.kind === "rating") {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) out[q.id] = n;
    } else if (q.kind === "choice") {
      if (typeof v === "string" && q.options.includes(v)) out[q.id] = v;
    } else if (typeof v === "string" && v.trim()) {
      out[q.id] = v.trim().slice(0, 2000);
    }
  }
  return out;
}

export type QuestionSummary =
  | { q: PlaytestQuestion; kind: "rating"; average: number | null; counts: number[]; n: number }
  | { q: PlaytestQuestion; kind: "choice"; counts: Record<string, number>; n: number }
  | { q: PlaytestQuestion; kind: "text"; answers: string[]; n: number };

export function summarise(qs: PlaytestQuestion[], answers: Record<string, string | number>[]): QuestionSummary[] {
  return qs.map((q) => {
    const vals = answers.map((a) => a[q.id]).filter((v) => v !== undefined);
    if (q.kind === "rating") {
      const nums = vals.map(Number).filter((n) => n >= 1 && n <= 5);
      const counts = [1, 2, 3, 4, 5].map((r) => nums.filter((n) => n === r).length);
      return { q, kind: "rating", n: nums.length, counts, average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null };
    }
    if (q.kind === "choice") {
      const counts = Object.fromEntries(q.options.map((o) => [o, vals.filter((v) => v === o).length]));
      return { q, kind: "choice", n: vals.length, counts };
    }
    return { q, kind: "text", n: vals.length, answers: vals.map(String).slice(-20) };
  });
}

export type ReportLike = { kind: string; title: string; body: string; build: string; platform: string; source: string; reporterName: string; answers: Record<string, string | number> };

/** Markdown for the GitHub issue created from a report. Player text is quoted, never interpreted. */
export function issueBody(r: ReportLike, qs: PlaytestQuestion[], link: string): string {
  const quote = (s: string) => s.split("\n").map((l) => `> ${l.replace(/@/g, "@​")}`).join("\n");
  const answered = qs.filter((q) => r.answers[q.id] !== undefined);
  return [
    `**${r.kind === "bug" ? "Bug report" : r.kind === "idea" ? "Idea" : "Player feedback"}** via ${r.source === "sdk" ? "in-game reporter" : r.source === "discord" ? "Discord" : "playtest form"}${r.reporterName ? ` from ${r.reporterName.replace(/@/g, "@​")}` : ""}`,
    "",
    r.body ? quote(r.body) : "_No description._",
    "",
    ...(answered.length ? ["| Question | Answer |", "| --- | --- |", ...answered.map((q) => `| ${q.prompt.replace(/\|/g, "\\|")} | ${String(r.answers[q.id]).replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/@/g, "@​")} |`), ""] : []),
    `- Build: \`${r.build || "unknown"}\``,
    `- Platform: ${r.platform || "unknown"}`,
    "",
    `_Triaged in Guildhall: ${link}_`,
  ].join("\n");
}

// --- In-game reporter (SDK) ------------------------------------------------------------------

export const KEY_PREFIX = "ghfb_";
export const newFeedbackKey = () => `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

export const sdkReportSchema = z.object({
  kind: z.enum(["bug", "feedback", "idea"]).default("bug"),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(8000).default(""),
  build: z.string().trim().max(80).default(""),
  platform: z.string().trim().max(80).default(""),
  player: z.string().trim().max(80).default(""),
  /** Optional PNG/JPEG/WebP, base64 (no data: prefix needed). */
  screenshot: z.string().max(Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64).optional(),
});

/** Simple per-key token bucket: `burst` reports, refilling `perMinute`. In-process, like pubsub. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private burst = 20, private perMinute = 10) {}
  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 60_000) * this.perMinute);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }
}
