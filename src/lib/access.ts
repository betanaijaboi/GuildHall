import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import type { CurrentUser } from "./auth";

export type MemberRole = (typeof memberships.$inferSelect)["role"];
export type Project = typeof projects.$inferSelect;

const RANK: Record<MemberRole, number> = { guest: 0, contractor: 1, member: 2, lead: 3, owner: 4 };

export function roleAtLeast(role: MemberRole | null | undefined, min: MemberRole): boolean {
  return role != null && RANK[role] >= RANK[min];
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return project ?? null;
}

export async function getRole(projectId: string, userId: string | undefined): Promise<MemberRole | null> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId)))
    .limit(1);
  return m?.role ?? null;
}

/**
 * Loads a project and the viewer's role. Private projects 404 for non-members so their
 * existence isn't leaked. Pass `min` to require a membership role.
 */
export async function loadProject(
  slug: string,
  user: CurrentUser | null,
  min?: MemberRole,
): Promise<{ project: Project; role: MemberRole | null }> {
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const role = await getRole(project.id, user?.id);
  if (project.visibility === "private" && !role) notFound();
  if (min && !roleAtLeast(role, min)) notFound();
  return { project, role };
}
