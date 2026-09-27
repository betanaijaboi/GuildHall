"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { roadmapItems, roadmapVotes, tasks } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { COLUMNS } from "@/lib/roadmap";
import { moveRoadmapItem, suggestIdea, toggleRoadmapVote } from "@/lib/roadmap-db";

const column = z.enum(COLUMNS.map((c) => c.id) as ["now", "next", "later", "shipped"]);
const path = (slug: string) => `/p/${slug}/roadmap`;

export async function addRoadmapItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const data = z
    .object({ title: z.string().trim().min(2).max(120), description: z.string().trim().max(2000), column, taskId: z.string().uuid().or(z.literal("")) })
    .parse({ title: form.get("title"), description: form.get("description") ?? "", column: form.get("column") ?? "later", taskId: form.get("taskId") ?? "" });
  if (data.taskId) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, data.taskId), eq(tasks.projectId, project.id))).limit(1);
    if (!t) throw new Error("Task not found");
  }
  await db.insert(roadmapItems).values({ ...data, taskId: data.taskId || null, projectId: project.id, public: form.get("public") !== "0", shippedAt: data.column === "shipped" ? new Date() : null });
  revalidatePath(path(slug));
}

export async function updateRoadmapItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const id = z.string().uuid().parse(form.get("id"));
  const to = form.get("column");
  if (to) {
    const [{ n }] = await db.select({ n: count() }).from(roadmapVotes).where(eq(roadmapVotes.itemId, id));
    await moveRoadmapItem(db, project.id, id, column.parse(to), n);
  }
  if (form.get("public")) await db.update(roadmapItems).set({ public: form.get("public") === "1" }).where(and(eq(roadmapItems.id, id), eq(roadmapItems.projectId, project.id)));
  if (form.get("delete") === "1") await db.delete(roadmapItems).where(and(eq(roadmapItems.id, id), eq(roadmapItems.projectId, project.id)));
  revalidatePath(path(slug));
}

/** Anyone signed in who can see the project may vote (players included, not just the team). */
export async function voteRoadmapItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user);
  await toggleRoadmapVote(db, project.id, z.string().uuid().parse(form.get("id")), user.id);
  revalidatePath(path(slug));
}

export async function suggestIdeaAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user);
  await suggestIdea(db, project.id, user, z.string().trim().min(3).max(160).parse(form.get("title")), z.string().trim().max(4000).parse(form.get("body") ?? ""));
  revalidatePath(path(slug));
}
