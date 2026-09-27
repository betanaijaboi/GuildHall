"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { channels, memberships, messages, milestones, posts, projects, tasks } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadDigest } from "@/lib/digest";
import { channelByName, postMessage } from "@/lib/messages";
import { milestoneFor, nextStage } from "@/lib/milestones";
import { announceStageDone, stageTasks } from "@/lib/pipeline-db";
import { generateProjectCredits } from "@/lib/credits-db";
import { fireEvent } from "@/lib/automations-db";
import { isStageLocked } from "@/lib/pipelines";

// --- Chat -----------------------------------------------------------------------------------

export async function sendMessage(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");
  const channelId = z.string().uuid().parse(form.get("channelId"));
  const body = z.string().trim().min(1).max(4000).parse(form.get("body"));
  const threadRootId = z.string().uuid().optional().parse(form.get("threadRootId") || undefined);

  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.projectId, project.id)))
    .limit(1);
  if (!channel) throw new Error("Channel not found");
  if (threadRootId) {
    const [root] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, threadRootId), eq(messages.channelId, channel.id)))
      .limit(1);
    if (!root) throw new Error("Thread not found");
  }
  await postMessage(db, { channelId: channel.id, authorId: user.id, body, threadRootId: threadRootId ?? null });
}

// --- Tasks ----------------------------------------------------------------------------------

export async function createTask(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "contractor");
  const title = z.string().trim().min(1).max(200).parse(form.get("title"));
  const assigneeId = z.string().uuid().optional().parse(form.get("assigneeId") || undefined);
  if (assigneeId) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.projectId, project.id), eq(memberships.userId, assigneeId)))
      .limit(1);
    if (!m) throw new Error("Assignee is not on this project");
  }
  await db.insert(tasks).values({ projectId: project.id, title, assigneeId: assigneeId ?? null });
  revalidatePath(`/p/${slug}/tasks`);
}

export async function setTaskStatus(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "contractor");
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(["todo", "doing", "done"]).parse(form.get("status"));
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.projectId, project.id))).limit(1);
  if (!task) return;
  if (task.pipelineItemId && task.stageIndex != null && status !== "todo") {
    const stages = await stageTasks(db, task.pipelineItemId);
    if (isStageLocked(stages.map((t) => t.status), task.stageIndex)) throw new Error("This stage is locked until the previous stage is done");
  }
  await db.update(tasks).set({ status, completedAt: status === "done" ? new Date() : null }).where(eq(tasks.id, task.id));
  if (task.pipelineItemId && task.stageIndex != null && status === "done" && task.status !== "done") {
    await announceStageDone(db, project.id, task.pipelineItemId, task.stageIndex);
  }
  if (status === "done" && task.status !== "done") {
    await fireEvent(db, project.id, { type: "task_done", pipeline: Boolean(task.pipelineItemId), vars: { title: task.title, actor: user.name, url: `/p/${slug}/tasks` } });
  }
  revalidatePath(`/p/${slug}/tasks`);
  revalidatePath(`/p/${slug}/pipelines`);
}

// --- Milestones -----------------------------------------------------------------------------

export async function toggleChecklistItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const id = z.string().uuid().parse(form.get("id"));
  const index = z.coerce.number().int().min(0).parse(form.get("index"));
  const [m] = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.projectId, project.id)))
    .limit(1);
  if (!m || !m.checklist[index]) return;
  const checklist = m.checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
  await db.update(milestones).set({ checklist }).where(eq(milestones.id, id));
  revalidatePath(`/p/${slug}/milestones`);
}

export async function addChecklistItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const id = z.string().uuid().parse(form.get("id"));
  const text = z.string().trim().min(1).max(200).parse(form.get("text"));
  const [m] = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.projectId, project.id)))
    .limit(1);
  if (!m) return;
  await db.update(milestones).set({ checklist: [...m.checklist, { text, done: false }] }).where(eq(milestones.id, id));
  revalidatePath(`/p/${slug}/milestones`);
}

/** Complete the current milestone, advance the project stage and open the next milestone. */
export async function completeMilestone(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const id = z.string().uuid().parse(form.get("id"));
  const [m] = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.projectId, project.id)))
    .limit(1);
  if (!m || m.completedAt) return;
  const next = nextStage(m.stage);
  await db.transaction(async (tx) => {
    await tx.update(milestones).set({ completedAt: new Date() }).where(eq(milestones.id, id));
    if (next) {
      await tx.update(projects).set({ stage: next }).where(eq(projects.id, project.id));
      await tx.insert(milestones).values({ projectId: project.id, ...milestoneFor(next) });
    }
  });
  const general = await channelByName(db, project.id, "general");
  if (general) {
    await postMessage(db, {
      channelId: general.id,
      authorId: null,
      body: `Milestone reached: ${m.title}.${next ? ` On to ${milestoneFor(next).title}!` : ""}`,
    });
  }
  // Reaching launch verifies everyone's credit on the game.
  if (next === "launch") {
    const result = await generateProjectCredits(db, project.id);
    if (general) {
      await postMessage(db, { channelId: general.id, authorId: null, body: `🎬 Launch! Verified credits added for ${result.count} people.${result.pr ? ` CREDITS.md PR: ${result.pr}` : ""}` });
    }
  }
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/milestones?celebrate=1`);
}

// --- Posts & digest -------------------------------------------------------------------------

export async function createPost(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const title = z.string().trim().min(1).max(160).parse(form.get("title"));
  const body = z.string().trim().min(1).max(20000).parse(form.get("body"));
  const visibility = z.enum(["team", "public"]).parse(form.get("visibility"));
  await db.insert(posts).values({ projectId: project.id, authorId: user.id, title, body, visibility });
  const general = await channelByName(db, project.id, "general");
  if (general) {
    await postMessage(db, { channelId: general.id, authorId: null, body: `${user.name} posted a ${visibility} update: ${title}` });
  }
  revalidatePath(`/p/${slug}`, "layout");
}

export async function postDigestToGeneral(slug: string): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const digest = await loadDigest(db, project.id, new Date(Date.now() - 7 * 86_400_000));
  const general = await channelByName(db, project.id, "general");
  if (!general) return;
  await postMessage(db, {
    channelId: general.id,
    authorId: null,
    body: `Weekly digest: ${digest.headline}`,
    card: { kind: "digest", title: `Week in ${project.name}`, lines: digest.highlights.slice(0, 8) },
  });
  revalidatePath(`/p/${slug}/workspace/general`);
}
