"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { automations, channels } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { aiConfigured, aiParse } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { parseRule, ruleSchema, TEMPLATES, type Rule } from "@/lib/automations";

async function assertChannels(projectId: string, rule: Rule) {
  const name = rule.action.type === "post_message" || rule.action.type === "post_digest" ? rule.action.channel : null;
  if (!name) return;
  const [c] = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.projectId, projectId), eq(channels.name, name))).limit(1);
  if (!c) throw new Error(`There's no #${name} channel in this project`);
}

export async function saveAutomation(slug: string, rule: Rule, source: "template" | "custom" | "ai"): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const parsed = ruleSchema.parse(rule);
  await assertChannels(project.id, parsed);
  await db.insert(automations).values({ projectId: project.id, name: parsed.name, trigger: parsed.trigger, action: parsed.action, source, createdBy: user.id });
  revalidatePath(`/p/${slug}/automations`);
}

export async function enableTemplate(slug: string, form: FormData): Promise<void> {
  const i = z.coerce.number().int().min(0).max(TEMPLATES.length - 1).parse(form.get("index"));
  await saveAutomation(slug, TEMPLATES[i], "template");
}

export async function toggleAutomation(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const id = z.string().uuid().parse(form.get("id"));
  const [a] = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.projectId, project.id))).limit(1);
  if (!a) return;
  await db.update(automations).set({ enabled: !a.enabled }).where(eq(automations.id, a.id));
  revalidatePath(`/p/${slug}/automations`);
}

export async function deleteAutomation(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await db.delete(automations).where(and(eq(automations.id, z.string().uuid().parse(form.get("id"))), eq(automations.projectId, project.id)));
  revalidatePath(`/p/${slug}/automations`);
}

/**
 * Turn a plain-English request into a rule for the lead to confirm. Uses Claude when configured
 * (structured output validated against the rule schema), otherwise the deterministic parser.
 */
export async function draftAutomation(slug: string, text: string): Promise<{ rule: Rule | null; via: "ai" | "parser"; error?: string }> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const request = z.string().trim().min(5).max(500).parse(text);
  const channelNames = (await db.select({ name: channels.name }).from(channels).where(eq(channels.projectId, project.id))).map((c) => c.name);

  if (aiConfigured()) {
    const rule = await aiParse({
      schema: ruleSchema,
      effort: "low",
      maxTokens: 4000,
      system: [
        "You convert a game team's request into one automation rule for their project workspace.",
        "Triggers: ci_failed (optional branch), release_published, task_done (pipelineOnly for asset-pipeline stages), asset_submitted, asset_approved, member_joined, weekly (day 0=Sunday..6=Saturday, hourUtc).",
        "Actions: post_message (channel, text, optional mention handle without @), draft_devlog, post_digest (channel).",
        "Message text may use {title}, {url}, {actor}, {branch}. Keep it short and friendly.",
        `Only use these channels: ${channelNames.join(", ")}. Name the rule in a few words.`,
      ].join("\n"),
      user: request,
    });
    if (rule) return { rule, via: "ai" };
  }
  const rule = parseRule(request);
  if (rule && !channelNames.includes((rule.action as { channel?: string }).channel ?? channelNames[0])) {
    return { rule: null, via: "parser", error: "That channel doesn't exist in this project." };
  }
  return rule ? { rule, via: "parser" } : { rule: null, via: "parser", error: "I couldn't turn that into a rule. Try something like \"when CI fails on main, ping @amara in #builds\"." };
}
