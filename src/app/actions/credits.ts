"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { creditConfirmations, credits } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { creditSource, titleKey } from "@/lib/credits";
import { generateProjectCredits } from "@/lib/credits-db";
import { channelByName, postMessage } from "@/lib/messages";

export async function addCredit(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = z
    .object({
      title: z.string().trim().min(1).max(120),
      role: z.string().trim().min(1).max(80),
      year: z.coerce.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
      externalUrl: z.string().trim().max(400).optional(),
    })
    .parse({ title: form.get("title"), role: form.get("role"), year: form.get("year") || undefined, externalUrl: form.get("externalUrl") || undefined });
  if (data.externalUrl && !creditSource(data.externalUrl)) throw new Error("Link a Steam, IGDB, MobyGames, itch.io or store page (https)");
  await db.insert(credits).values({ userId: user.id, ...data, titleKey: titleKey(data.title), source: "self" });
  revalidatePath(`/people/${user.handle}`);
}

export async function deleteCredit(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  await db.delete(credits).where(and(eq(credits.id, id), eq(credits.userId, user.id), eq(credits.source, "self")));
  revalidatePath(`/people/${user.handle}`);
}

/** Vouch for someone's credit — only if you have a credit on the same title yourself. */
export async function confirmCredit(form: FormData): Promise<void> {
  const me = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const handle = z.string().parse(form.get("handle"));
  const [credit] = await db.select().from(credits).where(and(eq(credits.id, id), ne(credits.userId, me.id))).limit(1);
  if (!credit || credit.source !== "self") throw new Error("That credit can't be confirmed");
  const [mine] = await db.select({ id: credits.id }).from(credits).where(and(eq(credits.userId, me.id), eq(credits.titleKey, credit.titleKey))).limit(1);
  if (!mine) throw new Error("Only people credited on the same title can confirm it");
  await db.insert(creditConfirmations).values({ creditId: credit.id, confirmerId: me.id }).onConflictDoNothing();
  revalidatePath(`/people/${handle}`);
}

export async function generateCreditsNow(slug: string): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const result = await generateProjectCredits(db, project.id);
  const general = await channelByName(db, project.id, "general");
  if (general) {
    await postMessage(db, {
      channelId: general.id,
      authorId: null,
      body: [`🎬 Verified credits generated for ${result.count} people. They now appear on everyone's profile.`, result.pr ? `CREDITS.md PR: ${result.pr}` : "", result.note ?? ""].filter(Boolean).join("\n"),
    });
  }
  revalidatePath(`/p/${slug}/settings`);
}
