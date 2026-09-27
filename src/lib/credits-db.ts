import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { credits, memberships, projectRepos, projects, users } from "@/db/schema";
import { creditsMarkdown, titleKey } from "./credits";
import { githubConfigured } from "./env";
import { openFilesPullRequest } from "./github/client";
import { skillLabel } from "./taxonomy";

const ROLE_LABEL: Record<string, string> = { owner: "Project lead", lead: "Lead", member: "Contributor", contractor: "Contractor", guest: "Special thanks" };

/**
 * Verified credits for everyone on a Guildhall project's roster (e.g. at launch), plus a
 * CREDITS.md pull request to the first linked repo. Idempotent per (project, person).
 */
export async function generateProjectCredits(db: Db, projectId: string): Promise<{ count: number; pr: string | null; note: string | null }> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { count: 0, pr: null, note: null };
  const roster = await db
    .select({ id: users.id, name: users.name, handle: users.handle, role: memberships.role, skillId: memberships.skillId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.projectId, projectId))
    .orderBy(asc(memberships.joinedAt));
  const rows = roster.map((m) => ({ ...m, label: m.skillId ? skillLabel(m.skillId) : ROLE_LABEL[m.role] }));
  const year = new Date().getFullYear();
  for (const r of rows) {
    await db
      .insert(credits)
      .values({ userId: r.id, title: project.name, titleKey: titleKey(project.name), role: r.label, year, source: "guildhall", projectId })
      .onConflictDoUpdate({ target: [credits.projectId, credits.userId], set: { role: r.label, title: project.name, titleKey: titleKey(project.name) } });
  }

  const [repo] = await db.select().from(projectRepos).where(eq(projectRepos.projectId, projectId)).limit(1);
  if (!repo || !githubConfigured()) return { count: rows.length, pr: null, note: null };
  try {
    const pr = await openFilesPullRequest(repo.installationId, repo.fullName, repo.defaultBranch, [
      { path: "CREDITS.md", content: creditsMarkdown(project.name, rows.map((r) => ({ name: r.name, handle: r.handle, role: r.label }))) },
    ], { branchPrefix: "guildhall/credits", commitMessage: "docs: update CREDITS.md from Guildhall roster", title: "Update credits", body: "Credits generated from the verified Guildhall roster." });
    return { count: rows.length, pr, note: null };
  } catch (err) {
    return { count: rows.length, pr: null, note: `Couldn't open the CREDITS.md PR: ${(err as Error).message}` };
  }
}
