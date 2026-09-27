"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { portfolioItems, profileSkills, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { avatarSchema } from "@/lib/avatar";
import { ENGAGEMENTS, ENGINES, isSkillId, PLATFORMS, SENIORITIES } from "@/lib/taxonomy";

const ids = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id));
const pick = (form: FormData, key: string, allowed: Set<string>) =>
  form.getAll(key).map(String).filter((v) => allowed.has(v));

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  headline: z.string().trim().max(120),
  bio: z.string().trim().max(2000),
  timezone: z.string().trim().max(64),
  availability: z.enum(["open", "limited", "busy"]),
  seniority: z.enum(SENIORITIES).or(z.literal("")),
  tools: z.string().max(500),
});

export async function updateProfile(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = profileSchema.parse({
    name: form.get("name"),
    headline: form.get("headline") ?? "",
    bio: form.get("bio") ?? "",
    timezone: form.get("timezone") ?? "",
    availability: form.get("availability"),
    seniority: form.get("seniority") ?? "",
    tools: form.get("tools") ?? "",
  });
  const skills = form.getAll("skills").map(String).filter(isSkillId).slice(0, 12);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: data.name,
        headline: data.headline,
        bio: data.bio,
        timezone: data.timezone || null,
        availability: data.availability,
        seniority: data.seniority || null,
        engines: pick(form, "engines", ids(ENGINES)),
        platforms: pick(form, "platforms", ids(PLATFORMS)),
        engagements: pick(form, "engagements", ids(ENGAGEMENTS)),
        tools: [...new Set(data.tools.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 30),
      })
      .where(eq(users.id, user.id));
    await tx.delete(profileSkills).where(eq(profileSkills.userId, user.id));
    if (skills.length) await tx.insert(profileSkills).values(skills.map((skillId) => ({ userId: user.id, skillId })));
  });

  revalidatePath(`/people/${user.handle}`);
  redirect(`/people/${user.handle}`);
}

const portfolioSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url().refine((u) => /^https?:\/\//.test(u), "Must be an http(s) link"),
  description: z.string().trim().max(500),
});

export async function addPortfolioItem(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = portfolioSchema.parse({
    title: form.get("title"),
    url: form.get("url"),
    description: form.get("description") ?? "",
  });
  await db.insert(portfolioItems).values({ userId: user.id, ...data });
  revalidatePath("/settings/profile");
}

export async function deletePortfolioItem(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  await db.delete(portfolioItems).where(and(eq(portfolioItems.id, id), eq(portfolioItems.userId, user.id)));
  revalidatePath("/settings/profile");
}

export async function saveAvatar(config: unknown): Promise<{ ok: true }> {
  const user = await requireUser();
  const avatar = avatarSchema.parse(config);
  await db.update(users).set({ avatar }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
