import { z } from "zod";

/**
 * Automations (C14): "when → then" rules in game-dev language. Pure matching, templating and
 * plain-English parsing live here so they're unit-tested; the runner is in automations-db.ts.
 */

export const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ci_failed"), branch: z.string().max(100).nullable() }),
  z.object({ type: z.literal("release_published") }),
  z.object({ type: z.literal("task_done"), pipelineOnly: z.boolean() }),
  z.object({ type: z.literal("asset_submitted") }),
  z.object({ type: z.literal("asset_approved") }),
  z.object({ type: z.literal("member_joined") }),
  z.object({ type: z.literal("weekly"), day: z.number().int().min(0).max(6), hourUtc: z.number().int().min(0).max(23) }),
]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("post_message"), channel: z.string().regex(/^[a-z0-9-]{1,40}$/), text: z.string().min(1).max(500), mention: z.string().regex(/^[a-z0-9-]{1,39}$/i).nullable() }),
  z.object({ type: z.literal("draft_devlog") }),
  z.object({ type: z.literal("post_digest"), channel: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
]);

export const ruleSchema = z.object({ name: z.string().min(1).max(100), trigger: triggerSchema, action: actionSchema });

export type Trigger = z.infer<typeof triggerSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Rule = z.infer<typeof ruleSchema>;

/** Events the app emits. `vars` are available to message templates as {title}, {url}, {actor}, {branch}. */
export type AutomationEvent =
  | { type: "ci_failed"; branch: string; vars: Vars }
  | { type: "release_published"; vars: Vars }
  | { type: "task_done"; pipeline: boolean; vars: Vars }
  | { type: "asset_submitted"; vars: Vars }
  | { type: "asset_approved"; vars: Vars }
  | { type: "member_joined"; vars: Vars }
  | { type: "weekly"; day: number; hourUtc: number; vars: Vars };

export type Vars = Partial<Record<"title" | "url" | "actor" | "branch", string>>;

export function matches(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  switch (trigger.type) {
    case "ci_failed":
      return !trigger.branch || trigger.branch === (event as { branch: string }).branch;
    case "task_done":
      return !trigger.pipelineOnly || (event as { pipeline: boolean }).pipeline;
    case "weekly": {
      const e = event as { day: number; hourUtc: number };
      return trigger.day === e.day && trigger.hourUtc === e.hourUtc;
    }
    default:
      return true;
  }
}

/** Fill {placeholders}; unknown ones are left visible so mistakes are obvious. */
export function render(template: string, vars: Vars): string {
  return template.replace(/\{(title|url|actor|branch)\}/g, (m, k: keyof Vars) => vars[k] ?? m);
}

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case "ci_failed": return `CI fails${t.branch ? ` on ${t.branch}` : ""}`;
    case "release_published": return "a release is published";
    case "task_done": return t.pipelineOnly ? "a pipeline stage is done" : "a task is done";
    case "asset_submitted": return "an asset is submitted for review";
    case "asset_approved": return "an asset is approved";
    case "member_joined": return "someone joins the team";
    case "weekly": return `every ${DAYS[t.day][0].toUpperCase()}${DAYS[t.day].slice(1)} at ${String(t.hourUtc).padStart(2, "0")}:00 UTC`;
  }
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case "post_message": return `post in #${a.channel}${a.mention ? ` and ping @${a.mention}` : ""}: "${a.text}"`;
    case "draft_devlog": return "draft a team devlog post";
    case "post_digest": return `post the weekly digest in #${a.channel}`;
  }
}

export const TEMPLATES: Rule[] = [
  { name: "CI failure on main pings the team", trigger: { type: "ci_failed", branch: "main" }, action: { type: "post_message", channel: "builds", text: "🔥 main is red: {title}. Who's on it? {url}", mention: null } },
  { name: "Draft a devlog for every release", trigger: { type: "release_published" }, action: { type: "draft_devlog" } },
  { name: "Weekly digest on Fridays", trigger: { type: "weekly", day: 5, hourUtc: 16 }, action: { type: "post_digest", channel: "general" } },
  { name: "Announce approved art", trigger: { type: "asset_approved" }, action: { type: "post_message", channel: "general", text: "🎨 {title} was approved by {actor}! {url}", mention: null } },
  { name: "Welcome new party members", trigger: { type: "member_joined" }, action: { type: "post_message", channel: "general", text: "👋 Everyone say hi to {actor}! Start with the GDD Overview and #proposals.", mention: null } },
];

/**
 * Deterministic plain-English → rule parser, used when no AI key is configured (and as a
 * cross-check). Returns null when it can't find both a trigger and an action.
 */
export function parseRule(input: string): Rule | null {
  const s = input.toLowerCase();
  let trigger: Trigger | null = null;
  const branch = /\b(?:on|in) (?:branch )?([a-z0-9._/-]+)\b/.exec(s.split(/\b(?:ping|post|notify|mention|tell)\b/)[0])?.[1];
  const day = DAYS.findIndex((d) => s.includes(d));
  if (/\b(ci|build|tests?|pipeline check)s? (fail|fails|failed|breaks?|broke|is red|goes red)/.test(s)) trigger = { type: "ci_failed", branch: branch && branch !== "ci" ? branch : null };
  else if (/\brelease|\bship(s|ped)?\b|\bpublish/.test(s)) trigger = { type: "release_published" };
  else if (/\b(stage|pipeline)\b.*\b(done|complete|finished)/.test(s)) trigger = { type: "task_done", pipelineOnly: true };
  else if (/\btask\b.*\b(done|complete|finished|closed)/.test(s)) trigger = { type: "task_done", pipelineOnly: false };
  else if (/\b(art|asset|render|concept)s?\b.*\bapproved\b/.test(s)) trigger = { type: "asset_approved" };
  else if (/\b(art|asset|render|concept)s?\b.*\b(submitted|uploaded)\b/.test(s)) trigger = { type: "asset_submitted" };
  else if (/\b(join|joins|joined)\b/.test(s)) trigger = { type: "member_joined" };
  else if (/\bevery\b/.test(s) && day >= 0) {
    const hour = /\bat (\d{1,2})(?::00)?\s*(am|pm)?/.exec(s);
    let h = hour ? Number(hour[1]) % 24 : 9;
    if (hour?.[2] === "pm" && h < 12) h += 12;
    if (hour?.[2] === "am" && h === 12) h = 0;
    trigger = { type: "weekly", day, hourUtc: h };
  }
  if (!trigger) return null;

  let action: Action | null = null;
  const channel = /#([a-z0-9-]{1,40})/.exec(s)?.[1];
  const mention = /@([a-z0-9-]{1,39})/.exec(s)?.[1] ?? null;
  if (/\bdevlog\b/.test(s)) action = { type: "draft_devlog" };
  else if (/\bdigest\b/.test(s)) action = { type: "post_digest", channel: channel ?? "general" };
  else if (/\b(ping|post|notify|mention|tell|message|announce|alert)\b/.test(s)) {
    const defaultChannel = trigger.type === "ci_failed" || trigger.type === "release_published" ? "builds" : trigger.type.startsWith("asset") ? "art" : "general";
    const text =
      trigger.type === "ci_failed" ? "🔥 CI failed{branchNote}: {title} {url}".replace("{branchNote}", trigger.branch ? ` on ${trigger.branch}` : "")
      : trigger.type === "asset_submitted" ? "🎨 {title} is ready for review {url}"
      : trigger.type === "asset_approved" ? "✅ {title} approved {url}"
      : trigger.type === "release_published" ? "📦 New build: {title} {url}"
      : trigger.type === "task_done" ? "✅ {title} is done"
      : trigger.type === "member_joined" ? "👋 Welcome {actor}!"
      : "⏰ Weekly reminder";
    action = { type: "post_message", channel: channel ?? defaultChannel, text, mention };
  }
  if (!action) return null;
  return { name: input.trim().slice(0, 100), trigger, action };
}
