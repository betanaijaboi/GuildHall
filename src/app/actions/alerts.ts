"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { savedSearches, users } from "@/db/schema";
import { markAllRead } from "@/lib/alerts-db";
import { requireUser } from "@/lib/auth";
import { ENGINES, isSkillId, labelFor, skillLabel, STAGES } from "@/lib/taxonomy";

const MAX_SEARCHES = 20;

/** Save the current role search from /projects as an alert. */
export async function saveRoleSearch(form: FormData): Promise<void> {
  const user = await requireUser();
  const skill = String(form.get("skill") ?? "");
  const engine = String(form.get("engine") ?? "");
  const stage = String(form.get("stage") ?? "");
  const s = {
    skill: isSkillId(skill) ? skill : null,
    engine: ENGINES.some((e) => e.id === engine) ? engine : null,
    stage: STAGES.some((x) => x.id === stage) ? stage : null,
  };
  if (!s.skill && !s.engine && !s.stage) throw new Error("Pick at least one filter to alert on");
  const [{ n }] = await db.select({ n: count() }).from(savedSearches).where(eq(savedSearches.userId, user.id));
  if (n >= MAX_SEARCHES) throw new Error(`You can keep up to ${MAX_SEARCHES} alerts`);
  const name = [s.skill && `${skillLabel(s.skill)} roles`, s.engine && `on ${labelFor(ENGINES, s.engine)}`, s.stage && `in ${labelFor(STAGES, s.stage)}`].filter(Boolean).join(" ") || "Roles";
  await db.insert(savedSearches).values({ userId: user.id, name, ...s });
  revalidatePath("/projects");
  revalidatePath("/settings/notifications");
}

export async function updateSavedSearch(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const where = and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id));
  if (form.get("delete") === "1") await db.delete(savedSearches).where(where);
  else await db.update(savedSearches).set({ alerts: form.get("alerts") === "1" }).where(where);
  revalidatePath("/settings/notifications");
}

export async function saveEmailPrefs(form: FormData): Promise<void> {
  const user = await requireUser();
  const email = z.string().trim().max(254).email().or(z.literal("")).parse(form.get("email") ?? "");
  await db.update(users).set({ email: email || null, emailDigest: Boolean(email) && form.get("emailDigest") === "on" }).where(eq(users.id, user.id));
  revalidatePath("/settings/notifications");
}

export async function markNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await markAllRead(db, user.id);
  revalidatePath("/", "layout");
}
