"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { githubInstallations, projectRepos } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listInstallationRepos, openTemplatePullRequest } from "@/lib/github/client";
import { templateFiles } from "@/lib/github/templates";
import { channelByName, postMessage } from "@/lib/messages";

/** Link a repo to a project. The installation must have been installed by the current user. */
export async function linkRepo(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const [installationId, repoId] = z
    .string()
    .regex(/^\d+:\d+$/)
    .parse(form.get("repo"))
    .split(":")
    .map(Number);

  const [installation] = await db
    .select()
    .from(githubInstallations)
    .where(and(eq(githubInstallations.id, installationId), eq(githubInstallations.installedByUserId, user.id)))
    .limit(1);
  if (!installation) throw new Error("Installation not found for your account");

  const repo = (await listInstallationRepos(installationId)).find((r) => r.id === repoId);
  if (!repo) throw new Error("The app doesn't have access to that repository");

  await db
    .insert(projectRepos)
    .values({ projectId: project.id, installationId, repoId, fullName: repo.fullName, defaultBranch: repo.defaultBranch })
    .onConflictDoNothing();
  const channel = await channelByName(db, project.id, "github");
  if (channel) await postMessage(db, { channelId: channel.id, authorId: null, body: `Linked ${repo.fullName}. Activity will appear here.` });
  revalidatePath(`/p/${slug}/settings`);
}

export async function unlinkRepo(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const repoId = z.coerce.number().int().parse(form.get("repoId"));
  await db.delete(projectRepos).where(and(eq(projectRepos.projectId, project.id), eq(projectRepos.repoId, repoId)));
  revalidatePath(`/p/${slug}/settings`);
}

export async function openSetupPullRequest(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const repoId = z.coerce.number().int().parse(form.get("repoId"));
  const [link] = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.projectId, project.id), eq(projectRepos.repoId, repoId)))
    .limit(1);
  if (!link) throw new Error("Repo is not linked to this project");
  const url = await openTemplatePullRequest(link.installationId, link.fullName, link.defaultBranch, templateFiles(project.engine, project.name));
  const channel = await channelByName(db, project.id, "code");
  if (channel) await postMessage(db, { channelId: channel.id, authorId: null, body: `${user.name} opened the Guildhall setup PR: ${url}` });
  revalidatePath(`/p/${slug}/settings`);
}
