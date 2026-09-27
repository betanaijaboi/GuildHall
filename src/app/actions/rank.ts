"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { endorsements, profileSkills, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sharesProject } from "@/lib/rank-db";

export async function toggleEndorsement(form: FormData): Promise<void> {
  const me = await requireUser();
  const handle = z.string().min(1).max(40).parse(form.get("handle"));
  const skillId = z.string().min(3).max(60).parse(form.get("skillId"));
  const [them] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!them || them.id === me.id) throw new Error("You can't endorse yourself");
  const [hasSkill] = await db.select().from(profileSkills).where(and(eq(profileSkills.userId, them.id), eq(profileSkills.skillId, skillId))).limit(1);
  if (!hasSkill) throw new Error("They don't list that skill");
  if (!(await sharesProject(db, me.id, them.id))) throw new Error("You can only endorse people you've shared a project with");
  const removed = await db
    .delete(endorsements)
    .where(and(eq(endorsements.fromId, me.id), eq(endorsements.toId, them.id), eq(endorsements.skillId, skillId)))
    .returning();
  if (!removed.length) await db.insert(endorsements).values({ fromId: me.id, toId: them.id, skillId });
  revalidatePath(`/people/${handle}`);
}
