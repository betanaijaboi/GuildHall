import { and, eq, inArray } from "drizzle-orm";
import { BookOpen, Link2, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { assets, channels, gddLinks, gddPages, pipelineItems, tasks, users } from "@/db/schema";
import { createPage, deletePage, linkToPage, pinPageToChannel, unlinkFromPage } from "@/app/actions/gdd";
import { AssetStatusChip } from "@/components/asset-status";
import { Avatar } from "@/components/avatar";
import { GddEditor } from "@/components/gdd-editor";
import { Markdown } from "@/components/markdown";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { buildTree, pageProgress, type LinkStatus } from "@/lib/gdd";
import { ensureGdd } from "@/lib/gdd-db";
import { progress as pipelineProgress } from "@/lib/pipelines";

export const metadata = { title: "GDD" };

export default async function GddPage({ params, searchParams }: { params: Promise<{ slug: string; pageId: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, pageId } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  if (!/^[0-9a-f-]{36}$/.test(pageId)) notFound();
  await ensureGdd(db, project.id, user.id);
  const all = await db.select().from(gddPages).where(eq(gddPages.projectId, project.id));
  const page = all.find((p) => p.id === pageId);
  if (!page) notFound();
  const canEdit = roleAtLeast(role, "member");
  const isLead = roleAtLeast(role, "lead");

  const links = await db.select().from(gddLinks).where(eq(gddLinks.pageId, page.id));
  const ids = (t: string) => links.filter((l) => l.targetType === t).map((l) => l.targetId);
  const [linkedTasks, linkedPipes, linkedAssets, pipeTasks, [editor], projectTasks, projectPipes, projectAssets, projectChannels] = await Promise.all([
    ids("task").length ? db.select().from(tasks).where(inArray(tasks.id, ids("task"))) : Promise.resolve([]),
    ids("pipeline").length ? db.select().from(pipelineItems).where(inArray(pipelineItems.id, ids("pipeline"))) : Promise.resolve([]),
    ids("asset").length ? db.select().from(assets).where(inArray(assets.id, ids("asset"))) : Promise.resolve([]),
    ids("pipeline").length ? db.select({ item: tasks.pipelineItemId, status: tasks.status }).from(tasks).where(inArray(tasks.pipelineItemId, ids("pipeline"))) : Promise.resolve([]),
    page.updatedBy ? db.select().from(users).where(eq(users.id, page.updatedBy)).limit(1) : Promise.resolve([]),
    canEdit ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.projectId, project.id))) : Promise.resolve([]),
    canEdit ? db.select({ id: pipelineItems.id, name: pipelineItems.name }).from(pipelineItems).where(eq(pipelineItems.projectId, project.id)) : Promise.resolve([]),
    canEdit ? db.select({ id: assets.id, title: assets.title }).from(assets).where(eq(assets.projectId, project.id)) : Promise.resolve([]),
    isLead ? db.select().from(channels).where(eq(channels.projectId, project.id)) : Promise.resolve([]),
  ]);
  const pipeProgress = (id: string) => pipelineProgress(pipeTasks.filter((t) => t.item === id).map((t) => t.status));
  const statuses: LinkStatus[] = [
    ...linkedTasks.map((t) => ({ type: "task" as const, status: t.status })),
    ...linkedPipes.map((p) => ({ type: "pipeline" as const, progress: pipeProgress(p.id) })),
    ...linkedAssets.map((a) => ({ type: "asset" as const, status: a.status })),
  ];
  const pct = pageProgress(statuses);
  const linkedIds = new Set(links.map((l) => l.targetId));
  const pinnedIn = projectChannels.filter((c) => c.pinnedPageId === page.id);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr_300px]">
      <aside className="space-y-3">
        <div className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><BookOpen size={14} /> Design doc</div>
        <ul className="space-y-0.5 text-sm">
          {buildTree(all).map((root) => (
            <li key={root.id}>
              <Link href={`/p/${slug}/gdd/${root.id}`} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${root.id === page.id ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/5 font-medium" : "text-fg-muted hover:bg-muted hover:text-fg"}`}>
                <span>{root.emoji}</span> <span className="truncate">{root.title}</span>
              </Link>
              {root.children.length > 0 && (
                <ul className="ml-4 border-l border-border pl-2">
                  {root.children.map((c) => (
                    <li key={c.id}>
                      <Link href={`/p/${slug}/gdd/${c.id}`} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] ${c.id === page.id ? "font-medium text-fg" : "text-fg-muted hover:text-fg"}`}>
                        <span>{c.emoji}</span> <span className="truncate">{c.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <details className="px-2 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-fg-muted hover:text-fg"><Plus size={14} /> New page</summary>
            <form action={createPage.bind(null, slug)} className="mt-2 space-y-2">
              <div className="flex gap-1">
                <input name="emoji" defaultValue="📄" maxLength={8} className="input w-12 px-1 text-center" />
                <input name="title" required placeholder="Title" className="input" />
              </div>
              <select name="parentId" className="input text-xs" defaultValue={page.parentId ?? page.id}>
                <option value="">Top level</option>
                {all.filter((p) => !p.parentId).map((p) => <option key={p.id} value={p.id}>Inside {p.emoji} {p.title}</option>)}
              </select>
              <button className="btn-secondary w-full">Create</button>
            </form>
          </details>
        )}
      </aside>

      <article className="min-w-0">
        {edit && canEdit ? (
          <GddEditor slug={slug} page={page} />
        ) : (
          <div className="card space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-4xl">{page.emoji}</span>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-3xl font-bold tracking-tight">{page.title}</h1>
                <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                  {editor && <><Avatar user={editor} size={18} /> {editor.name} ·</>} edited {page.updatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · v{page.version}
                </div>
              </div>
              {canEdit && <Link href={`?edit=1`} className="btn-secondary"><Pencil size={15} /> Edit</Link>}
            </div>
            {page.body.trim() ? <Markdown text={page.body} /> : <p className="text-fg-muted">This page is empty. {canEdit && "Hit Edit to start writing."}</p>}
          </div>
        )}
      </article>

      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-display font-semibold">Build progress</h2>
          {pct == null ? (
            <p className="text-sm text-fg-muted">Link tasks, pipelines or assets to track how much of this design is built.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2"><span className="font-display text-3xl font-bold text-gradient">{pct}%</span><span className="text-xs text-fg-muted">of linked work done</span></div>
              <div className="xp-bar"><span style={{ width: `${pct}%` }} /></div>
            </>
          )}
          <ul className="space-y-1.5 text-sm">
            {linkedTasks.map((t) => (
              <LinkRow key={t.id} slug={slug} pageId={page.id} id={t.id} canEdit={canEdit} href={`/p/${slug}/tasks`} label={t.title} right={<span className="chip capitalize">{t.status}</span>} />
            ))}
            {linkedPipes.map((p) => (
              <LinkRow key={p.id} slug={slug} pageId={page.id} id={p.id} canEdit={canEdit} href={`/p/${slug}/pipelines`} label={p.name} right={<span className="chip">{pipeProgress(p.id)}%</span>} />
            ))}
            {linkedAssets.map((a) => (
              <LinkRow key={a.id} slug={slug} pageId={page.id} id={a.id} canEdit={canEdit} href={`/p/${slug}/assets/${a.id}`} label={a.title} right={<AssetStatusChip status={a.status} />} />
            ))}
          </ul>
          {canEdit && (
            <form action={linkToPage.bind(null, slug, page.id)} className="flex gap-1">
              <select name="target" required className="input py-1 text-xs" defaultValue="">
                <option value="" disabled>Link work…</option>
                <optgroup label="Tasks">{projectTasks.filter((t) => !linkedIds.has(t.id)).map((t) => <option key={t.id} value={`task:${t.id}`}>{t.title}</option>)}</optgroup>
                <optgroup label="Pipelines">{projectPipes.filter((p) => !linkedIds.has(p.id)).map((p) => <option key={p.id} value={`pipeline:${p.id}`}>{p.name}</option>)}</optgroup>
                <optgroup label="Assets">{projectAssets.filter((a) => !linkedIds.has(a.id)).map((a) => <option key={a.id} value={`asset:${a.id}`}>{a.title}</option>)}</optgroup>
              </select>
              <button className="btn-secondary px-2 py-1"><Link2 size={14} /></button>
            </form>
          )}
        </section>
        {isLead && (
          <section className="card space-y-2">
            <h2 className="font-display flex items-center gap-2 font-semibold"><Pin size={15} /> Pin to a channel</h2>
            {pinnedIn.length > 0 && <p className="text-xs text-fg-muted">Pinned in {pinnedIn.map((c) => `#${c.name}`).join(", ")}</p>}
            <form action={pinPageToChannel.bind(null, slug, page.id)} className="flex gap-1">
              <select name="channelId" className="input py-1 text-xs">{projectChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select>
              <button className="btn-secondary px-2 py-1 text-xs">Pin</button>
            </form>
            <form action={deletePage.bind(null, slug, page.id)}>
              <button className="mt-2 flex items-center gap-1 text-xs text-fg-muted hover:text-bad"><Trash2 size={12} /> Delete page{all.some((p) => p.parentId === page.id) ? " and its sub-pages" : ""}</button>
            </form>
          </section>
        )}
      </aside>
    </div>
  );
}

function LinkRow({ slug, pageId, id, canEdit, href, label, right }: { slug: string; pageId: string; id: string; canEdit: boolean; href: string; label: string; right: React.ReactNode }) {
  return (
    <li className="group flex items-center gap-2">
      <Link href={href} className="min-w-0 flex-1 truncate hover:text-accent">{label}</Link>
      {right}
      {canEdit && (
        <form action={unlinkFromPage.bind(null, slug, pageId)}>
          <input type="hidden" name="targetId" value={id} />
          <button className="text-fg-muted opacity-0 transition-opacity hover:text-bad group-hover:opacity-100" aria-label="Unlink"><X size={13} /></button>
        </form>
      )}
    </li>
  );
}
