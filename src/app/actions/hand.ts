"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { handOrder } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** Save the order the person dragged their hand into. */
export async function saveHandOrder(keys: string[]): Promise<void> {
  const user = await requireUser();
  const parsed = z.array(z.string().regex(/^(task|review|sign|release|fund|mention):[0-9a-f-]{36}$/)).max(200).parse(keys);
  await db.transaction(async (tx) => {
    await tx.delete(handOrder).where(eq(handOrder.userId, user.id));
    if (parsed.length) await tx.insert(handOrder).values(parsed.map((itemKey, position) => ({ userId: user.id, itemKey, position })));
  });
}
