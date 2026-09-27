/* eslint-disable @next/next/no-img-element */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ExternalLink, ImagePlus, Palette, Plus, StickyNote, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { assets, assetVersions, moodboardItems, moodboards, portfolioItems, users } from "@/db/schema";
import { addMoodboardItem, createMoodboard, deleteMoodboard, removeMoodboardItem } from "@/app/actions/moodboards";
import { Avatar } from "@/components/avatar";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { textOn } from "@/lib/moodboards";

export const metadata = { title: "Moodboards" };

export default async function MoodboardsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ board?: string }> }) {
  const { slug } = await params;
  const { board: boardParam } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const boards = await db
    .select({ b: moodboards, n: sql<number>`(select count(*)::int from ${moodboardItems} i where i.board_id = "moodboards"."id")` })
    .from(moodboards)
    .where(eq(moodboards.projectId, project.id))
    .orderBy(asc(moodboards.createdAt));
  const current = boards.find((x) => x.b.id === boardParam)?.b ?? boards[0]?.b;

  const items = current
    ? await db
        .select({ item: moodboardItems, piece: portfolioItems, artist: users })
        .from(moodboardItems)
        .leftJoin(portfolioItems, eq(portfolioItems.id, moodboardItems.portfolioItemId))
        .leftJoin(users, eq(users.id, portfolioItems.userId))
        .where(eq(moodboardItems.boardId, current.id))
        .orderBy(desc(moodboardItems.createdAt))
    : [];
  // Latest version of each project image on the board, served through the members-only file route.
  const assetIds = items.map((i) => i.item.assetId).filter((x): x is string => !!x);
  const versionRows = assetIds.length
    ? await db.select({ assetId: assetVersions.assetId, id: assetVersions.id, title: assets.title }).from(assetVersions).innerJoin(assets, eq(assets.id, assetVersions.assetId)).where(inArray(assetVersions.assetId, assetIds)).orderBy(desc(assetVersions.version))
    : [];
  const versionOf = new Map<string, { id: string; title: string }>();
  for (const v of versionRows) if (!versionOf.has(v.assetId)) versionOf.set(v.assetId, v);
  const projectImages = await db.select({ id: assets.id, title: assets.title }).from(assets).where(and(eq(assets.projectId, project.id), eq(assets.kind, "image"))).orderBy(desc(assets.updatedAt)).limit(50);
  const artists = new Map(items.filter((i) => i.artist).map((i) => [i.artist!.id, i.artist!]));
  const canDelete = (addedBy: string | null) => addedBy === user.id || roleAtLeast(role, "lead");
  const add = addMoodboardItem.bind(null, slug);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <h1 className="h2 flex items-center gap-2"><Palette size={20} className="text-accent" /> Moodboards</h1>
        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          {boards.map(({ b, n }) => (
            <li key={b.id}>
              <Link href={`?board=${b.id}`} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm ${b.id === current?.id ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/5 font-medium" : "text-fg-muted hover:bg-muted hover:text-fg"}`}>
                {b.name} <span className="ml-auto text-xs text-fg-muted">{n}</span>
              </Link>
            </li>
          ))}
        </ul>
        {roleAtLeast(role, "member") && (
          <form action={createMoodboard.bind(null, slug)} className="flex gap-1.5">
            <input name="name" required maxLength={80} placeholder="New board" className="input py-1.5 text-sm" aria-label="New moodboard name" />
            <button className="btn-secondary px-2" aria-label="Create moodboard"><Plus size={16} /></button>
          </form>
        )}
      </aside>

      {!current ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-sm text-fg-muted">
          <span className="animate-float text-5xl">🎨</span>
          Start a board for the look you&apos;re after: references, colours, notes, and pieces from people&apos;s portfolios.
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">{current.name}</h2>
            {artists.size > 0 && (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span>Artists on this board:</span>
                {[...artists.values()].map((a) => (
                  <Link key={a.id} href={`/people/${a.handle}`} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-2 hover:border-accent" title={`Invite ${a.name}`}>
                    <Avatar user={a} size={20} /> {a.name.split(" ")[0]}
                  </Link>
                ))}
              </div>
            )}
            {roleAtLeast(role, "lead") && (
              <form action={deleteMoodboard.bind(null, slug)} className="ml-auto">
                <input type="hidden" name="boardId" value={current.id} />
                <button className="btn-ghost py-1 text-xs text-bad"><Trash2 size={13} /> Delete board</button>
              </form>
            )}
          </div>

          <details className="card" open={items.length === 0}>
            <summary className="flex cursor-pointer items-center gap-2 font-medium"><ImagePlus size={16} className="text-accent" /> Add to the board</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <form action={add} className="space-y-2">
                <input type="hidden" name="boardId" value={current.id} />
                <input type="hidden" name="kind" value="image" />
                <input name="url" type="url" required placeholder="https://… image link" className="input" />
                <input name="caption" maxLength={200} placeholder="Why this reference?" className="input" />
                <button className="btn-secondary w-full">Add image</button>
              </form>
              <div className="space-y-2">
                <form action={add} className="flex gap-2">
                  <input type="hidden" name="boardId" value={current.id} />
                  <input type="hidden" name="kind" value="color" />
                  <input name="color" type="color" defaultValue="#1d4e89" className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Colour" />
                  <input name="caption" maxLength={200} placeholder="Deep sea blue" className="input" />
                  <button className="btn-secondary shrink-0">Add colour</button>
                </form>
                <form action={add} className="flex gap-2">
                  <input type="hidden" name="boardId" value={current.id} />
                  <input type="hidden" name="kind" value="note" />
                  <input name="caption" required maxLength={200} placeholder="Note: salt-worn wood, no pure blacks" className="input" />
                  <button className="btn-secondary shrink-0">Add note</button>
                </form>
                {projectImages.length > 0 && (
                  <form action={add} className="flex gap-2">
                    <input type="hidden" name="boardId" value={current.id} />
                    <input type="hidden" name="kind" value="asset" />
                    <select name="assetId" className="input" aria-label="Project image">{projectImages.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
                    <button className="btn-secondary shrink-0">Add asset</button>
                  </form>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-fg-muted">Tip: on anyone&apos;s profile, “Save to moodboard” pins a portfolio piece here and credits the artist.</p>
          </details>

          <ul className="columns-1 gap-3 sm:columns-2 xl:columns-3 [&>li]:mb-3">
            {items.map(({ item, piece, artist }) => (
              <li key={item.id} className="card group relative break-inside-avoid overflow-hidden p-0 animate-fade-up" data-testid="mood-item">
                {item.kind === "image" && item.url && <img src={item.url} alt={item.caption || "Reference image"} loading="lazy" referrerPolicy="no-referrer" className="w-full" />}
                {item.kind === "asset" && item.assetId && versionOf.get(item.assetId) && (
                  <Link href={`/p/${slug}/assets/${item.assetId}`}><img src={`/api/files/${versionOf.get(item.assetId)!.id}`} alt={versionOf.get(item.assetId)!.title} loading="lazy" className="w-full" /></Link>
                )}
                {item.kind === "portfolio" && piece && (
                  <>
                    {piece.imageUrl ? <img src={piece.imageUrl} alt={piece.title} loading="lazy" referrerPolicy="no-referrer" className="w-full" /> : <div className="bg-gradient-to-br from-violet-500/20 to-cyan-500/10 p-8 text-center font-display text-lg">{piece.title}</div>}
                    <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs">
                      {artist && <Avatar user={artist} size={20} />}
                      <a href={piece.url} target="_blank" rel="noreferrer nofollow" className="min-w-0 flex-1 truncate hover:underline">{piece.title} <ExternalLink size={10} className="inline" /></a>
                      {artist && <Link href={`/people/${artist.handle}`} className="flex shrink-0 items-center gap-1 text-accent hover:underline"><UserPlus size={12} /> {artist.name.split(" ")[0]}</Link>}
                    </div>
                  </>
                )}
                {item.kind === "color" && item.color && (
                  <div className="flex h-28 items-end p-3 font-mono text-sm" style={{ background: item.color, color: textOn(item.color) }}>{item.color}</div>
                )}
                {item.kind === "note" && <div className="flex gap-2 bg-amber-300/10 p-4 text-sm"><StickyNote size={16} className="mt-0.5 shrink-0 text-amber-400" />{item.caption}</div>}
                {item.caption && item.kind !== "note" && <p className="px-3 py-2 text-xs text-fg-muted">{item.caption}</p>}
                {canDelete(item.addedBy) && (
                  <form action={removeMoodboardItem.bind(null, slug)} className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <input type="hidden" name="id" value={item.id} />
                    <button className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur" aria-label="Remove from board"><Trash2 size={13} /></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
