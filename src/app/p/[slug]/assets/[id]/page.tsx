import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileBox, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { assetComments, assetReviews, assets, assetVersions, users } from "@/db/schema";
import { AssetReview } from "@/components/asset-review";
import { AssetStatusChip } from "@/components/asset-status";
import { AssetUploader } from "@/components/asset-uploader";
import { Avatar } from "@/components/avatar";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Asset review" };

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { slug, id } = await params;
  const { v } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.projectId, project.id))).limit(1);
  if (!asset) notFound();

  const versions = await db
    .select({ version: assetVersions, uploader: users })
    .from(assetVersions)
    .leftJoin(users, eq(users.id, assetVersions.uploadedBy))
    .where(eq(assetVersions.assetId, asset.id))
    .orderBy(desc(assetVersions.version));
  if (versions.length === 0) notFound();
  const latest = versions[0].version;
  const current = versions.find((x) => String(x.version.version) === v)?.version ?? latest;

  const [comments, reviews] = await Promise.all([
    db
      .select({ comment: assetComments, author: users })
      .from(assetComments)
      .leftJoin(users, eq(users.id, assetComments.authorId))
      .where(eq(assetComments.versionId, current.id))
      .orderBy(asc(assetComments.createdAt)),
    db
      .select({ review: assetReviews, reviewer: users, version: assetVersions.version })
      .from(assetReviews)
      .innerJoin(assetVersions, eq(assetVersions.id, assetReviews.versionId))
      .leftJoin(users, eq(users.id, assetReviews.reviewerId))
      .where(eq(assetReviews.assetId, asset.id))
      .orderBy(desc(assetReviews.createdAt)),
  ]);

  const canComment = roleAtLeast(role, "contractor");
  const canReview = roleAtLeast(role, "member");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/p/${slug}/assets`} className="btn-ghost"><ArrowLeft size={16} /> Assets</Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">{asset.title}</h1>
        <AssetStatusChip status={asset.status} />
        {asset.repoPath && (
          <span className="chip font-mono"><FileBox size={12} /> {asset.repoPath}</span>
        )}
      </div>

      <AssetReview
        slug={slug}
        asset={{ id: asset.id, title: asset.title, kind: asset.kind }}
        version={{ id: current.id, version: current.version, isLatest: current.id === latest.id, uploadedByMe: current.uploadedBy === user.id }}
        comments={comments.map(({ comment, author }) => ({
          id: comment.id,
          body: comment.body,
          x: comment.x,
          y: comment.y,
          timeSec: comment.timeSec,
          position3d: comment.position3d,
          normal3d: comment.normal3d,
          resolved: comment.resolved,
          createdAt: comment.createdAt.toISOString(),
          author: author ? { name: author.name, handle: author.handle } : null,
        }))}
        canComment={canComment}
        canReview={canReview}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="h2 flex items-center gap-2"><History size={18} className="text-accent" /> Versions</h2>
          <ol className="space-y-1">
            {versions.map(({ version, uploader }) => (
              <li key={version.id}>
                <Link
                  href={`?v=${version.version}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${version.id === current.id ? "bg-accent/15" : "hover:bg-muted"}`}
                >
                  <span className="font-display font-bold">v{version.version}</span>
                  {uploader && <Avatar user={uploader} size={22} />}
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{version.note || "No notes"}</span>
                  <span className="text-xs text-fg-muted">{version.createdAt.toLocaleDateString("en-GB")}</span>
                </Link>
              </li>
            ))}
          </ol>
          {canComment && <AssetUploader slug={slug} assetId={asset.id} compact />}
        </section>

        <section className="card space-y-3">
          <h2 className="h2">Review history</h2>
          {reviews.length === 0 && <p className="text-sm text-fg-muted">No decisions yet.</p>}
          <ol className="space-y-2">
            {reviews.map(({ review, reviewer, version }) => (
              <li key={review.id} className="flex items-start gap-3 text-sm">
                {reviewer && <Avatar user={reviewer} size={28} />}
                <div>
                  <span className="font-medium">{reviewer?.name ?? "Someone"}</span>{" "}
                  <span className={review.decision === "approved" ? "text-good" : "text-bad"}>
                    {review.decision === "approved" ? "approved" : "requested changes on"}
                  </span>{" "}
                  v{version}
                  {review.note && <p className="text-fg-muted">{review.note}</p>}
                  <div className="text-xs text-fg-muted">{review.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
