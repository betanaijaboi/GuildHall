import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { projectRepos } from "@/db/schema";
import { githubConfigured } from "./env";
import { inviteCollaborator, type GitHubPermission } from "./github/client";

export const GITHUB_PERMISSION: Record<string, GitHubPermission | null> = {
  owner: "admin",
  lead: "maintain",
  member: "push",
  contractor: "push",
  guest: null,
};

/** Invite a member to every linked repo. Failures are reported, never block joining. */
export async function grantRepoAccess(db: Db, projectId: string, login: string | null, permission: GitHubPermission | null): Promise<string[]> {
  const repos = await db.select().from(projectRepos).where(eq(projectRepos.projectId, projectId));
  if (!repos.length || !permission) return [];
  if (!login) return ["They haven't linked a GitHub account yet, so they weren't added to the repo."];
  if (!githubConfigured()) return ["GitHub isn't configured on this server, so repo access wasn't granted."];
  const notes: string[] = [];
  for (const repo of repos) {
    try {
      await inviteCollaborator(repo.installationId, repo.fullName, login, permission);
      notes.push(`Invited @${login} to ${repo.fullName} (${permission}).`);
    } catch (err) {
      notes.push(`Couldn't invite @${login} to ${repo.fullName}: ${(err as Error).message}. The app needs Administration: write.`);
    }
  }
  return notes;
}
