import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { projects } from "@/db/schema";
import { slugify } from "@/lib/slug";

/** A free project slug derived from `name` ("storm", "storm-2", …). */
export async function uniqueProjectSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}
