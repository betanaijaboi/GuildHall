import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { automations, posts } from "@/db/schema";
import { actionSchema, matches, render, triggerSchema, type AutomationEvent } from "./automations";
import { loadDigest } from "./digest";
import { channelByName, postMessage, type Notify } from "./messages";
import { publish } from "./pubsub";

/**
 * Run every enabled automation in a project that matches `event`. Automations only react to
 * domain events (never to messages), so one rule can't trigger another in a loop.
 * Failures in one rule are logged and never block the action that emitted the event.
 */
export async function fireEvent(db: Db, projectId: string, event: AutomationEvent, notify: Notify = publish): Promise<number> {
  const rules = await db.select().from(automations).where(and(eq(automations.projectId, projectId), eq(automations.enabled, true)));
  let fired = 0;
  for (const rule of rules) {
    const trigger = triggerSchema.safeParse(rule.trigger);
    const action = actionSchema.safeParse(rule.action);
    if (!trigger.success || !action.success || !matches(trigger.data, event)) continue;
    try {
      await runAction(db, projectId, action.data, event, notify);
      await db.update(automations).set({ fireCount: sql`${automations.fireCount} + 1`, lastFiredAt: new Date() }).where(eq(automations.id, rule.id));
      fired++;
    } catch (err) {
      console.error(`automation ${rule.id} failed:`, err);
    }
  }
  return fired;
}

async function runAction(db: Db, projectId: string, action: ReturnType<typeof actionSchema.parse>, event: AutomationEvent, notify: Notify) {
  switch (action.type) {
    case "post_message": {
      const channel = await channelByName(db, projectId, action.channel);
      if (!channel) return;
      const body = `${action.mention ? `@${action.mention} ` : ""}${render(action.text, event.vars)}`;
      await postMessage(db, { channelId: channel.id, authorId: null, body }, notify);
      return;
    }
    case "draft_devlog": {
      const title = event.vars.title ?? "New build";
      await db.insert(posts).values({
        projectId,
        authorId: null,
        title: `Draft: ${title}`,
        body: `What's new in ${title}:\n- \n- \n\nWhat's next:\n- \n\n(Drafted automatically from the release. Edit it, then repost it as public.)${event.vars.url ? `\n\nRelease notes: ${event.vars.url}` : ""}`,
        visibility: "team",
      });
      return;
    }
    case "post_digest": {
      const channel = await channelByName(db, projectId, action.channel);
      if (!channel) return;
      const digest = await loadDigest(db, projectId, new Date(Date.now() - 7 * 86_400_000));
      await postMessage(db, { channelId: channel.id, authorId: null, body: `Weekly digest: ${digest.headline}`, card: { kind: "digest", title: "This week", lines: digest.highlights.slice(0, 8) } }, notify);
      return;
    }
  }
}

/** Weekly rules due at `now` (UTC day + hour) that haven't fired in the last 6 days. */
export async function runWeekly(db: Db, now: Date): Promise<number> {
  const day = now.getUTCDay();
  const hourUtc = now.getUTCHours();
  const cutoff = new Date(now.getTime() - 6 * 86_400_000);
  const due = await db
    .select()
    .from(automations)
    .where(and(eq(automations.enabled, true), sql`${automations.trigger}->>'type' = 'weekly'`, or(isNull(automations.lastFiredAt), lt(automations.lastFiredAt, cutoff))));
  let fired = 0;
  const projects = new Set(due.filter((r) => { const t = triggerSchema.safeParse(r.trigger); return t.success && matches(t.data, { type: "weekly", day, hourUtc, vars: {} }); }).map((r) => r.projectId));
  for (const projectId of projects) fired += await fireEvent(db, projectId, { type: "weekly", day, hourUtc, vars: {} });
  return fired;
}
