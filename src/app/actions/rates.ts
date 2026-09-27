"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { rateReports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/fees";
import { REGIONS } from "@/lib/rates";
import { isSkillId, SENIORITIES } from "@/lib/taxonomy";

export async function submitRate(form: FormData): Promise<void> {
  const user = await requireUser();
  const skillId = z.string().refine(isSkillId).parse(form.get("skillId"));
  const seniority = z.enum(SENIORITIES).parse(form.get("seniority"));
  const region = z.enum(REGIONS.map((r) => r.id) as [string, ...string[]]).parse(form.get("region"));
  const hourly = parseMoney(String(form.get("hourly") ?? ""));
  if (hourly < 300 || hourly > 100000) throw new Error("Enter an hourly rate between $3 and $1,000");
  await db
    .insert(rateReports)
    .values({ userId: user.id, skillId, seniority, region, hourlyUsdCents: hourly })
    .onConflictDoUpdate({ target: [rateReports.userId, rateReports.skillId], set: { seniority, region, hourlyUsdCents: hourly, updatedAt: new Date() } });
  revalidatePath("/rates");
}

export async function deleteRate(form: FormData): Promise<void> {
  const user = await requireUser();
  const skillId = z.string().parse(form.get("skillId"));
  await db.delete(rateReports).where(and(eq(rateReports.userId, user.id), eq(rateReports.skillId, skillId)));
  revalidatePath("/rates");
}
