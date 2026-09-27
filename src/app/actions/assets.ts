"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { assetComments, assetReviews, assets, assetVersions } from "@/db/schema";
import { loadProject, roleAtLeast } from "@/lib/access";
import { postAssetActivity } from "@/lib/asset-feed";
import { assetStatus, formatTimecode, normalisePin } from "@/lib/assets";
import { requireUser } from "@/lib/auth";

async function loadAsset(slug: string, assetId: string) {
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, project.id))).limit(1);
  if (!asset) throw new Error("Asset not found");
  return { user, project, role, asset };
}

const commentSchema = z.object({
  assetId: z.string().uuid(),
  versionId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  x: z.number().optional(),
  y: z.number().optional(),
  timeSec: z.number().optional(),
  position3d: z.string().max(80).optional(),
  normal3d: z.string().max(80).optional(),
});

export async function addAssetComment(slug: string, input: z.input<typeof commentSchema>) {
  const data = commentSchema.parse(input);
  const { user, asset } = await loadAsset(slug, data.assetId);
  const [version] = await db
    .select({ id: assetVersions.id })
    .from(assetVersions)
    .where(and(eq(assetVersions.id, data.versionId), eq(assetVersions.assetId, asset.id)))
    .limit(1);
  if (!version) throw new Error("Version not found");
  const pin = normalisePin(asset.kind, data);
  await db.insert(assetComments).values({ assetId: asset.id, versionId: version.id, authorId: user.id, body: data.body, ...pin });
  revalidatePath(`/p/${slug}/assets/${asset.id}`);
}

export async function setCommentResolved(slug: string, input: { assetId: string; commentId: string; resolved: boolean }) {
  const { asset } = await loadAsset(slug, z.string().uuid().parse(input.assetId));
  await db
    .update(assetComments)
    .set({ resolved: Boolean(input.resolved) })
    .where(and(eq(assetComments.id, z.string().uuid().parse(input.commentId)), eq(assetComments.assetId, asset.id)));
  revalidatePath(`/p/${slug}/assets/${asset.id}`);
}

export async function reviewAsset(slug: string, input: { assetId: string; versionId: string; decision: "approved" | "changes_requested"; note?: string }) {
  const { user, project, role, asset } = await loadAsset(slug, z.string().uuid().parse(input.assetId));
  if (!roleAtLeast(role, "member")) throw new Error("Only team members can review");
  const decision = z.enum(["approved", "changes_requested"]).parse(input.decision);
  const note = z.string().trim().max(1000).parse(input.note ?? "");

  const [latest] = await db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(desc(assetVersions.version)).limit(1);
  if (!latest || latest.id !== input.versionId) throw new Error("Only the latest version can be reviewed");
  if (latest.uploadedBy === user.id && decision === "approved") throw new Error("Ask a teammate to approve your own upload");

  await db.insert(assetReviews).values({ assetId: asset.id, versionId: latest.id, reviewerId: user.id, decision, note });
  const reviews = await db.select().from(assetReviews).where(eq(assetReviews.assetId, asset.id));
  const status = assetStatus(latest.id, reviews);
  await db.update(assets).set({ status, updatedAt: sql`now()` }).where(eq(assets.id, asset.id));

  const openPins = await db
    .select({ body: assetComments.body, timeSec: assetComments.timeSec })
    .from(assetComments)
    .where(and(eq(assetComments.versionId, latest.id), eq(assetComments.resolved, false)));
  await postAssetActivity(
    db,
    project.id,
    slug,
    asset,
    decision === "approved" ? `${user.name} approved v${latest.version} of ${asset.title}` : `${user.name} requested changes on v${latest.version} of ${asset.title}`,
    {
      state: status,
      version: latest.version,
      lines: [
        ...(note ? [note] : []),
        ...(decision === "changes_requested" ? openPins.slice(0, 4).map((p) => (p.timeSec != null ? `${formatTimecode(p.timeSec)} ${p.body}` : p.body)) : []),
      ],
    },
  );
  revalidatePath(`/p/${slug}/assets`, "layout");
}
