import { desc, eq, sql } from "drizzle-orm";
import { Box, Film, MessageSquare, Radar } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { assetComments, assets, assetVersions, users } from "@/db/schema";
import { AssetUploader } from "@/components/asset-uploader";
import { Avatar } from "@/components/avatar";
import { AssetStatusChip } from "@/components/asset-status";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Assets" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "in_review", label: "In review" },
  { id: "changes_requested", label: "Changes requested" },
  { id: "approved", label: "Approved" },
];

export default async function AssetsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const { slug } = await params;
  const { status } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");

  const rows = await db
    .select({
      asset: assets,
      author: users,
      latest: sql<{ id: string; version: number; mime: string }>`(
        select json_build_object('id', v.id, 'version', v.version, 'mime', v.mime)
        from ${assetVersions} v where v.asset_id = ${assets.id} order by v.version desc limit 1)`,
      openComments: sql<number>`(select count(*)::int from ${assetComments} c where c.asset_id = ${assets.id} and not c.resolved)`,
    })
    .from(assets)
    .leftJoin(users, eq(users.id, assets.createdBy))
    .where(eq(assets.projectId, project.id))
    .orderBy(desc(assets.updatedAt));
  const list = status ? rows.filter((r) => r.asset.status === status) : rows;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div className="scroll-x flex items-center gap-2">
          {FILTERS.map((f) => {
            const count = f.id ? rows.filter((r) => r.asset.status === f.id).length : rows.length;
            const active = (status ?? "") === f.id;
            return (
              <Link key={f.id} href={f.id ? `?status=${f.id}` : "?"} className={`chip shrink-0 px-3 py-1.5 text-sm ${active ? "border-accent text-fg" : ""}`}>
                {f.label} <span className="text-fg-muted">{count}</span>
              </Link>
            );
          })}
          <Link href={`/p/${slug}/assets/radar`} className="btn-secondary ml-auto shrink-0 py-1.5"><Radar size={15} /> Conflict radar</Link>
        </div>
        {list.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-16 text-center text-fg-muted">
            <span className="animate-float text-5xl">🎨</span>
            <p>No assets here yet. Upload concept art, a turnaround, an animation or a GLB to start a review.</p>
          </div>
        ) : (
          <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(({ asset, author, latest, openComments }) => (
              <li key={asset.id}>
                <Link href={`/p/${slug}/assets/${asset.id}`} className="card card-hover group block overflow-hidden p-0">
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {asset.kind === "image" && latest && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${latest.id}`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                    {asset.kind === "video" && latest && (
                      <video src={`/api/files/${latest.id}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" />
                    )}
                    {asset.kind === "model" && (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-600/30 to-cyan-500/20">
                        <Box size={44} className="animate-float text-accent" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2"><AssetStatusChip status={asset.status} /></span>
                    <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {asset.kind === "video" && <Film size={11} className="mr-1 inline" />}v{latest?.version ?? 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    {author && <Avatar user={author} size={26} />}
                    <span className="min-w-0 flex-1 truncate font-medium group-hover:text-accent">{asset.title}</span>
                    {openComments > 0 && (
                      <span className="flex items-center gap-1 text-xs text-fg-muted"><MessageSquare size={13} /> {openComments}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        {roleAtLeast(role, "contractor") && <AssetUploader slug={slug} />}
        <p className="px-1 text-xs text-fg-muted">
          Reviews post to <span className="font-medium">#art</span>, threaded per asset. Source files stay in your repo (Git LFS); upload previews here.
        </p>
      </aside>
    </div>
  );
}
