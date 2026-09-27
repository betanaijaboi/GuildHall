import { z } from "zod";
import type { HuddleAction, HuddleRecap } from "@/db/schema";

/**
 * Huddle recaps (C5). Captions are transcribed in each speaker's browser (opt-in) and shared
 * notes are typed during the call; at the end we turn them into a summary, decisions and
 * action items. Claude does it when configured; these rules are the fallback and cross-check.
 */

export const MAX_PARTICIPANTS = 8; // Full-mesh WebRTC: every peer sends to every other.

export type Line = { speaker: string; handle: string; text: string };

export const recapSchema = z.object({
  summary: z.string().describe("2-4 sentences: what the call was about and where it landed"),
  decisions: z.array(z.string()).describe("Decisions the group actually agreed, one line each"),
  actions: z
    .array(z.object({ title: z.string().describe("Imperative task title, under 100 chars"), owner: z.string().nullable().describe("Handle of the person who took it, or null") }))
    .describe("Concrete follow-ups someone committed to or was asked to do"),
});

const ACTION = /\b(i'll|i will|i'm going to|we need to|we should|need to|todo|to-do|action(?: item)?:|can you|could you|let me|follow up)\b/i;
const DECISION = /\b(decided|we'll go with|let's go with|going with|agreed|decision:|final answer|lock(?:ed)? (?:it )?in)\b/i;
const TASK_LINE = /^\s*(?:[-*]\s*)?(?:\[ \]\s*|todo:?\s+|action:?\s+)/i;
const DECISION_LINE = /^\s*(?:[-*]\s*)?decision:?\s+/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "I'll fix the dock shader" → "Fix the dock shader". */
export function toTaskTitle(text: string): string {
  const t = clean(text)
    .replace(TASK_LINE, "")
    .replace(/^.*?\b(i'll|i will|i'm going to|we need to|we should|need to|let me|can you|could you)\s+/i, "")
    .replace(/^@[a-z0-9-]{1,39}[,:]?\s+/i, "") // the owner is kept separately
    .replace(/^(please|also|then|and)\s+/i, "")
    .replace(/\?$/, "");
  return cap(t).slice(0, 100);
}

function ownerOf(line: Line, handles: Set<string>): string | null {
  const mention = /@([a-z0-9-]{1,39})/i.exec(line.text)?.[1]?.toLowerCase();
  if (mention && handles.has(mention)) return mention;
  if (/\b(i'll|i will|i'm going to|let me)\b/i.test(line.text)) return line.handle;
  return null;
}

export function ruleRecap(lines: Line[], notes: string, participants: { name: string; handle: string }[], minutes: number): HuddleRecap {
  const handles = new Set(participants.map((p) => p.handle.toLowerCase()));
  const decisions: string[] = [];
  const actions: HuddleAction[] = [];
  const seen = new Set<string>();
  const addAction = (title: string, owner: string | null) => {
    const key = title.toLowerCase();
    if (title.length < 4 || seen.has(key)) return;
    seen.add(key);
    actions.push({ title, owner });
  };
  for (const raw of notes.split("\n")) {
    if (!raw.trim()) continue;
    const line = { speaker: "", handle: "", text: raw };
    if (DECISION_LINE.test(raw)) decisions.push(cap(clean(raw.replace(DECISION_LINE, ""))));
    else if (TASK_LINE.test(raw)) addAction(toTaskTitle(raw), ownerOf(line, handles));
  }
  for (const line of lines) {
    if (DECISION.test(line.text)) decisions.push(cap(clean(line.text)));
    else if (ACTION.test(line.text)) addAction(toTaskTitle(line.text), ownerOf(line, handles));
  }
  const who = participants.map((p) => p.name).join(", ") || "the team";
  const sources = [lines.length ? `${lines.length} captioned line${lines.length === 1 ? "" : "s"}` : "", notes.trim() ? "shared notes" : ""].filter(Boolean);
  const from = sources.length ? `From ${sources.join(" and ")}: ` : "No captions or notes. ";
  const summary = `${Math.max(1, Math.round(minutes))}-minute huddle with ${who}. ${from}${decisions.length} decision${decisions.length === 1 ? "" : "s"} and ${actions.length} follow-up${actions.length === 1 ? "" : "s"}.`;
  return { summary, decisions: [...new Set(decisions)].slice(0, 10), actions: actions.slice(0, 15), source: "rules" };
}

/** Keep an AI recap honest: owners must be participants, sizes bounded. */
export function normaliseRecap(r: z.infer<typeof recapSchema>, participants: { handle: string }[]): HuddleRecap {
  const handles = new Set(participants.map((p) => p.handle.toLowerCase()));
  return {
    summary: r.summary.trim().slice(0, 800),
    decisions: r.decisions.map((d) => d.trim()).filter(Boolean).slice(0, 10),
    actions: r.actions
      .map((a) => ({ title: a.title.trim().slice(0, 100), owner: a.owner && handles.has(a.owner.replace(/^@/, "").toLowerCase()) ? a.owner.replace(/^@/, "").toLowerCase() : null }))
      .filter((a) => a.title.length >= 3)
      .slice(0, 15),
    source: "ai",
  };
}

/** Transcript text for the model, bounded so long calls stay within budget. */
export function transcriptFor(lines: Line[], notes: string, maxChars = 60_000): string {
  const body = lines.map((l) => `${l.speaker} (@${l.handle}): ${l.text}`).join("\n");
  const trimmed = body.length > maxChars ? `[earlier captions trimmed]\n${body.slice(-maxChars)}` : body;
  return `<captions>\n${trimmed || "(none)"}\n</captions>\n<shared_notes>\n${notes.trim() || "(none)"}\n</shared_notes>`;
}
