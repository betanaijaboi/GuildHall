import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { gddPages } from "@/db/schema";
import { DEFAULT_GDD } from "./gdd";

/** Create the default page tree the first time a project opens its GDD. */
export async function ensureGdd(db: Db, projectId: string, userId: string | null) {
  const existing = await db.select({ id: gddPages.id }).from(gddPages).where(eq(gddPages.projectId, projectId)).limit(1);
  if (existing.length) return;
  await db.insert(gddPages).values(DEFAULT_GDD.map((p, i) => ({ projectId, title: p.title, emoji: p.emoji, body: p.body, position: i, updatedBy: userId })));
}
