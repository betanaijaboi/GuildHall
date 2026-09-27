"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { assets, memberships, pipelineItems, projectRepos, tasks } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { githubConfigured } from "@/lib/env";
import { addBlockedBy, addSubIssue, createIssue } from "@/lib/github/client";
import { channelByName, postMessage } from "@/lib/messages";
import { pipelineChannel } from "@/lib/pipeline-db";
import { templateById } from "@/lib/pipelines";

export async function createPipelineItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const name = z.string().trim().min(1).max(100).parse(form.get("name"));
  const template = templateById(z.string().parse(form.get("template")));
  if (!template) throw new Error("Unknown pipeline");
  const assetId = z.string().uuid().optional().parse(form.get("assetId") || undefined);
  if (assetId) {
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, project.id))).limit(1);
    if (!a) throw new Error("Asset not found");
  }

  const { item, stageRows } = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(pipelineItems)
      .values({ projectId: project.id, name, template: template.id, stages: template.stages, assetId: assetId ?? null, createdBy: user.id })
      .returning();
    const stageRows = await tx
      .insert(tasks)
      .values(template.stages.map((stage, i) => ({ projectId: project.id, title: `${name}: ${stage}`, pipelineItemId: item.id, stageIndex: i })))
      .returning();
    return { item, stageRows };
  });

  const notes = [`${user.name} started ${template.emoji} ${name} through the ${template.label.toLowerCase()} pipeline (${template.stages.join(" → ")}).`];
  notes.push(...(await syncToGitHub(project.id, item.id, name, template.label, stageRows.sort((a, b) => a.stageIndex! - b.stageIndex!))));
  const channel = await channelByName(db, project.id, pipelineChannel(template.id));
  if (channel) await postMessage(db, { channelId: channel.id, authorId: null, threadKey: `pipeline:${item.id}`, body: notes.join("\n") });
  revalidatePath(`/p/${slug}/pipelines`);
}

/**
 * Mirror the pipeline to the first linked repo: a parent issue, one sub-issue per stage, each
 * blocked by the previous. The stage tasks take the issue numbers, so closing an issue on GitHub
 * completes the stage here via the existing issues webhook. Best effort: failures are reported.
 */
async function syncToGitHub(projectId: string, itemId: string, name: string, label: string, stages: (typeof tasks.$inferSelect)[]): Promise<string[]> {
  const [repo] = await db.select().from(projectRepos).where(eq(projectRepos.projectId, projectId)).limit(1);
  if (!repo || !githubConfigured()) return [];
  try {
    const parent = await createIssue(repo.installationId, repo.fullName, `${label}: ${name}`, `Asset pipeline tracked in Guildhall.\n\n${stages.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`, ["pipeline"]);
    await db.update(pipelineItems).set({ ghParentIssueNumber: parent.number }).where(eq(pipelineItems.id, itemId));
    let previous: { id: number } | null = null;
    for (const stage of stages) {
      const issue = await createIssue(repo.installationId, repo.fullName, stage.title, `Stage ${stage.stageIndex! + 1} of ${stages.length} for ${name}.`, ["pipeline"]);
      await db.update(tasks).set({ ghRepoId: repo.repoId, ghIssueNumber: issue.number, ghUrl: issue.url }).where(eq(tasks.id, stage.id));
      await addSubIssue(repo.installationId, repo.fullName, parent.number, issue.id);
      if (previous) await addBlockedBy(repo.installationId, repo.fullName, issue.number, previous.id);
      previous = issue;
    }
    return [`Mirrored to ${repo.fullName}#${parent.number} with ${stages.length} sub-issues.`];
  } catch (err) {
    return [`Couldn't mirror to GitHub: ${(err as Error).message}`];
  }
}

export async function assignStage(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const taskId = z.string().uuid().parse(form.get("taskId"));
  const assigneeId = z.string().uuid().optional().parse(form.get("assigneeId") || undefined);
  if (assigneeId) {
    const [m] = await db.select().from(memberships).where(and(eq(memberships.projectId, project.id), eq(memberships.userId, assigneeId))).limit(1);
    if (!m) throw new Error("Assignee is not on this project");
  }
  await db.update(tasks).set({ assigneeId: assigneeId ?? null }).where(and(eq(tasks.id, taskId), eq(tasks.projectId, project.id)));
  revalidatePath(`/p/${slug}/pipelines`);
}

export async function deletePipelineItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const id = z.string().uuid().parse(form.get("id"));
  await db.delete(pipelineItems).where(and(eq(pipelineItems.id, id), eq(pipelineItems.projectId, project.id)));
  revalidatePath(`/p/${slug}/pipelines`);
}
