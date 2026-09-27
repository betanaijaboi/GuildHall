"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { assets, moodboardItems, moodboards, portfolioItems, projects } from "@/db/schema";
import { getRole, loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { normaliseHex, safeImageUrl } from "@/lib/moodboards";

const MAX_ITEMS = 200;
const page = (slug: string, boardId: string) => `/p/${slug}/moodboards?board=${boardId}`;

export async function createMoodboard(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const name = z.string().trim().min(1).max(80).parse(form.get("name"));
  const [board] = await db.insert(moodboards).values({ projectId: project.id, name, createdBy: user.id }).returning();
  redirect(page(slug, board.id));
}

export async function deleteMoodboard(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await db.delete(moodboards).where(and(eq(moodboards.id, z.string().uuid().parse(form.get("boardId"))), eq(moodboards.projectId, project.id)));
  redirect(`/p/${slug}/moodboards`);
}

async function boardIn(projectId: string, boardId: string) {
  const [b] = await db.select().from(moodboards).where(and(eq(moodboards.id, boardId), eq(moodboards.projectId, projectId))).limit(1);
  if (!b) throw new Error("Moodboard not found");
  const [{ n }] = await db.select({ n: count() }).from(moodboardItems).where(eq(moodboardItems.boardId, b.id));
  return { board: b, full: n >= MAX_ITEMS };
}

export async function addMoodboardItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "contractor");
  const { board, full } = await boardIn(project.id, z.string().uuid().parse(form.get("boardId")));
  if (full) throw new Error(`A moodboard holds up to ${MAX_ITEMS} items`);
  const kind = z.enum(["image", "color", "note", "asset"]).parse(form.get("kind"));
  const caption = z.string().trim().max(200).parse(form.get("caption") ?? "");
  const base = { boardId: board.id, kind, caption, addedBy: user.id };
  if (kind === "image") {
    const url = safeImageUrl(String(form.get("url") ?? ""));
    if (!url) throw new Error("Paste an https image link");
    await db.insert(moodboardItems).values({ ...base, url });
  } else if (kind === "color") {
    const color = normaliseHex(String(form.get("color") ?? ""));
    if (!color) throw new Error("Use a hex colour like #1d4e89");
    await db.insert(moodboardItems).values({ ...base, color });
  } else if (kind === "note") {
    if (!caption) throw new Error("Write the note");
    await db.insert(moodboardItems).values(base);
  } else {
    const assetId = z.string().uuid().parse(form.get("assetId"));
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, project.id), eq(assets.kind, "image"))).limit(1);
    if (!a) throw new Error("Pick one of this project's images");
    await db.insert(moodboardItems).values({ ...base, assetId });
  }
  revalidatePath(`/p/${slug}/moodboards`);
}

export async function removeMoodboardItem(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const id = z.string().uuid().parse(form.get("id"));
  const [row] = await db.select({ item: moodboardItems }).from(moodboardItems).innerJoin(moodboards, eq(moodboards.id, moodboardItems.boardId)).where(and(eq(moodboardItems.id, id), eq(moodboards.projectId, project.id))).limit(1);
  if (!row) return;
  if (row.item.addedBy !== user.id && !roleAtLeast(role, "lead")) throw new Error("Only whoever added it, or a lead, can remove it");
  await db.delete(moodboardItems).where(eq(moodboardItems.id, id));
  revalidatePath(`/p/${slug}/moodboards`);
}

/** From someone's profile: pin one of their portfolio pieces to a moodboard on a project you work on. */
export async function savePortfolioToMoodboard(form: FormData): Promise<void> {
  const user = await requireUser();
  const boardId = z.string().uuid().parse(form.get("boardId"));
  const itemId = z.string().uuid().parse(form.get("portfolioItemId"));
  const [row] = await db.select({ board: moodboards, slug: projects.slug }).from(moodboards).innerJoin(projects, eq(projects.id, moodboards.projectId)).where(eq(moodboards.id, boardId)).limit(1);
  if (!row || !roleAtLeast(await getRole(row.board.projectId, user.id), "contractor")) throw new Error("Moodboard not found");
  const [piece] = await db.select({ id: portfolioItems.id }).from(portfolioItems).where(eq(portfolioItems.id, itemId)).limit(1);
  if (!piece) throw new Error("Portfolio piece not found");
  await db.insert(moodboardItems).values({ boardId, kind: "portfolio", portfolioItemId: itemId, addedBy: user.id }).onConflictDoNothing();
  revalidatePath(`/p/${row.slug}/moodboards`);
  redirect(page(row.slug, boardId));
}
