import { asc, eq, isNull, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { gddPages } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ensureGdd } from "@/lib/gdd-db";

export default async function GddIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");
  await ensureGdd(db, project.id, user.id);
  const [first] = await db.select({ id: gddPages.id }).from(gddPages).where(and(eq(gddPages.projectId, project.id), isNull(gddPages.parentId))).orderBy(asc(gddPages.position)).limit(1);
  redirect(`/p/${slug}/gdd/${first.id}`);
}
