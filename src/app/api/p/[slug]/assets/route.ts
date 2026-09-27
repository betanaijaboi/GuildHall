import { and, eq, max, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assets, assetVersions } from "@/db/schema";
import { getProjectBySlug, getRole, roleAtLeast } from "@/lib/access";
import { postAssetActivity } from "@/lib/asset-feed";
import { MAX_UPLOAD_BYTES, sniffFile } from "@/lib/assets";
import { getCurrentUser } from "@/lib/auth";
import { putFile } from "@/lib/storage";
import { fireEvent } from "@/lib/automations-db";

const fields = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(1000).default(""),
  repoPath: z.string().trim().max(400).regex(/^[^\0]*$/).optional(),
  assetId: z.string().uuid().optional(),
});

/** Upload a new asset, or a new version of an existing one (multipart form). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const project = await getProjectBySlug(slug);
  const role = project ? await getRole(project.id, user.id) : null;
  if (!project || !roleAtLeast(role, "contractor")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 1024 * 1024) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });
  const parsed = fields.safeParse({
    title: form.get("title") || undefined,
    note: form.get("note") ?? "",
    repoPath: form.get("repoPath") || undefined,
    assetId: form.get("assetId") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFile(bytes);
  if (!sniffed) return NextResponse.json({ error: "Unsupported file. Use PNG, JPEG, WebP, GIF, MP4, WebM or GLB." }, { status: 415 });

  let asset: typeof assets.$inferSelect;
  if (parsed.data.assetId) {
    const [existing] = await db.select().from(assets).where(and(eq(assets.id, parsed.data.assetId), eq(assets.projectId, project.id))).limit(1);
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    if (existing.kind !== sniffed.kind) return NextResponse.json({ error: `A new version must also be a ${existing.kind}` }, { status: 400 });
    asset = existing;
  } else {
    if (!parsed.data.title) return NextResponse.json({ error: "Give the asset a title" }, { status: 400 });
    [asset] = await db
      .insert(assets)
      .values({ projectId: project.id, title: parsed.data.title, kind: sniffed.kind, repoPath: parsed.data.repoPath ?? null, createdBy: user.id })
      .returning();
  }

  const fileKey = await putFile(bytes, sniffed.ext);
  const version = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: max(assetVersions.version) }).from(assetVersions).where(eq(assetVersions.assetId, asset.id));
    const [v] = await tx
      .insert(assetVersions)
      .values({ assetId: asset.id, version: (n ?? 0) + 1, fileKey, mime: sniffed.mime, size: bytes.length, note: parsed.data.note, uploadedBy: user.id })
      .returning();
    await tx.update(assets).set({ status: "in_review", updatedAt: sql`now()` }).where(eq(assets.id, asset.id));
    return v;
  });

  await postAssetActivity(
    db,
    project.id,
    slug,
    asset,
    version.version === 1 ? `${user.name} submitted ${asset.title} for review` : `${user.name} uploaded v${version.version} of ${asset.title}`,
    { state: "in_review", version: version.version, lines: version.note ? [version.note] : undefined },
  );
  await fireEvent(db, project.id, { type: "asset_submitted", vars: { title: `${asset.title} v${version.version}`, actor: user.name, url: `/p/${slug}/assets/${asset.id}` } });
  return NextResponse.json({ assetId: asset.id, version: version.version });
}
