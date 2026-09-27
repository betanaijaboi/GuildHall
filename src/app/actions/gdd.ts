"use server";

import { and, eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { assets, channels, gddLinks, gddPages, messages, pipelineItems, tasks } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { postMessage } from "@/lib/messages";

async function loadPage(slug: string, pageId: string, min: "guest" | "member" | "lead" = "member") {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, min);
  const [page] = await db.select().from(gddPages).where(and(eq(gddPages.id, z.string().uuid().parse(pageId)), eq(gddPages.projectId, project.id))).limit(1);
  if (!page) throw new Error("Page not found");
  return { user, project, page };
}

export async function createPage(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const title = z.string().trim().min(1).max(100).parse(form.get("title"));
  const emoji = z.string().trim().max(8).parse(form.get("emoji") || "📄") || "📄";
  const parentId = z.string().uuid().optional().parse(form.get("parentId") || undefined);
  if (parentId) {
    const [parent] = await db.select().from(gddPages).where(and(eq(gddPages.id, parentId), eq(gddPages.projectId, project.id))).limit(1);
    if (!parent || parent.parentId) throw new Error("Pages can nest one level deep");
  }
  const [{ n }] = await db.select({ n: max(gddPages.position) }).from(gddPages).where(eq(gddPages.projectId, project.id));
  const [page] = await db.insert(gddPages).values({ projectId: project.id, title, emoji, parentId: parentId ?? null, position: (n ?? 0) + 1, updatedBy: user.id }).returning();
  redirect(`/p/${slug}/gdd/${page.id}?edit=1`);
}

/** Save with optimistic concurrency: if someone saved since you opened the editor, refuse. */
export async function savePage(slug: string, pageId: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const { user, page } = await loadPage(slug, pageId);
  const title = z.string().trim().min(1).max(100).parse(form.get("title"));
  const emoji = z.string().trim().max(8).parse(form.get("emoji") || page.emoji) || page.emoji;
  const body = z.string().max(100_000).parse(form.get("body") ?? "");
  const openedVersion = z.coerce.number().int().parse(form.get("version"));
  const updated = await db
    .update(gddPages)
    .set({ title, emoji, body, updatedBy: user.id, updatedAt: new Date(), version: sql`${gddPages.version} + 1` })
    .where(and(eq(gddPages.id, page.id), eq(gddPages.version, openedVersion)))
    .returning();
  if (!updated.length) return { ok: false, error: "Someone else saved this page while you were editing. Copy your text, reload, and merge." };
  revalidatePath(`/p/${slug}/gdd`, "layout");
  return { ok: true };
}

export async function deletePage(slug: string, pageId: string): Promise<void> {
  const { project, page } = await loadPage(slug, pageId, "lead");
  await db.delete(gddPages).where(and(eq(gddPages.parentId, page.id), eq(gddPages.projectId, project.id)));
  await db.delete(gddPages).where(eq(gddPages.id, page.id));
  redirect(`/p/${slug}/gdd`);
}

export async function linkToPage(slug: string, pageId: string, form: FormData): Promise<void> {
  const { project, page } = await loadPage(slug, pageId);
  const [type, targetId] = z.string().regex(/^(task|pipeline|asset):[0-9a-f-]{36}$/).parse(form.get("target")).split(":") as ["task" | "pipeline" | "asset", string];
  const table = type === "task" ? tasks : type === "pipeline" ? pipelineItems : assets;
  const [target] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, targetId), eq(table.projectId, project.id))).limit(1);
  if (!target) throw new Error("Not found in this project");
  await db.insert(gddLinks).values({ pageId: page.id, targetType: type, targetId }).onConflictDoNothing();
  revalidatePath(`/p/${slug}/gdd/${page.id}`);
}

export async function unlinkFromPage(slug: string, pageId: string, form: FormData): Promise<void> {
  const { page } = await loadPage(slug, pageId);
  const targetId = z.string().uuid().parse(form.get("targetId"));
  await db.delete(gddLinks).where(and(eq(gddLinks.pageId, page.id), eq(gddLinks.targetId, targetId)));
  revalidatePath(`/p/${slug}/gdd/${page.id}`);
}

export async function pinPageToChannel(slug: string, pageId: string, form: FormData): Promise<void> {
  const { project, page } = await loadPage(slug, pageId, "lead");
  const channelId = z.string().uuid().parse(form.get("channelId"));
  await db.update(channels).set({ pinnedPageId: page.id }).where(and(eq(channels.id, channelId), eq(channels.projectId, project.id)));
  revalidatePath(`/p/${slug}`, "layout");
}

/** Promote an accepted forum topic into a GDD page (from the topic panel). */
export async function promoteTopicToPage(slug: string, messageId: string): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const [row] = await db
    .select({ m: messages, c: channels })
    .from(messages)
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .where(and(eq(messages.id, z.string().uuid().parse(messageId)), eq(channels.projectId, project.id), eq(channels.kind, "forum")))
    .limit(1);
  if (!row?.m.title) throw new Error("Topic not found");
  const [{ n }] = await db.select({ n: max(gddPages.position) }).from(gddPages).where(eq(gddPages.projectId, project.id));
  const [page] = await db
    .insert(gddPages)
    .values({ projectId: project.id, title: row.m.title.slice(0, 100), emoji: "💡", body: `${row.m.body}\n\n> From #${row.c.name}, accepted by the team.`, position: (n ?? 0) + 1, updatedBy: user.id })
    .returning();
  await postMessage(db, { channelId: row.c.id, authorId: null, threadRootId: row.m.id, body: `${user.name} added this to the GDD: ${page.title}` });
  redirect(`/p/${slug}/gdd/${page.id}`);
}
