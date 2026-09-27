import { and, desc, eq, gte } from "drizzle-orm";
import { ArrowLeft, GitBranch, Lock, Radar, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { fileTouches, projectRepos } from "@/db/schema";
import { LockActions } from "@/components/lock-actions";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fileName, findHotspots, UNMERGEABLE_EXTENSIONS } from "@/lib/conflicts";
import { githubConfigured } from "@/lib/env";
import { listLfsLocks, type LfsLock } from "@/lib/github/client";

export const metadata = { title: "Conflict radar" };

const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export default async function RadarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [touches, repos] = await Promise.all([
    db.select().from(fileTouches).where(and(eq(fileTouches.projectId, project.id), gte(fileTouches.at, since))).orderBy(desc(fileTouches.at)).limit(500),
    db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id)),
  ]);
  const hotspots = findHotspots(touches, new Date());

  let locks: (LfsLock & { repoId: number; repo: string })[] = [];
  const lockErrors: string[] = [];
  if (githubConfigured()) {
    for (const r of repos) {
      try {
        locks.push(...(await listLfsLocks(r.installationId, r.fullName)).map((l) => ({ ...l, repoId: r.repoId, repo: r.fullName })));
      } catch (e) {
        lockErrors.push(`${r.fullName}: ${(e as Error).message}`);
      }
    }
    locks = locks.sort((a, b) => b.lockedAt.localeCompare(a.lockedAt));
  }
  const latestByPath = new Map<string, (typeof touches)[number]>();
  for (const t of touches) if (!latestByPath.has(t.path)) latestByPath.set(t.path, t);
  const recent = [...latestByPath.values()].slice(0, 20);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/p/${slug}/assets`} className="btn-ghost"><ArrowLeft size={16} /> Assets</Link>
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight"><Radar className="text-accent" /> Conflict radar</h1>
      </div>
      <p className="max-w-3xl text-sm text-fg-muted">
        Unmergeable files ({UNMERGEABLE_EXTENSIONS.map((e) => `.${e}`).slice(0, 8).join(" ")} …) can&apos;t be merged in Git. Two people editing one means someone loses work.
        The radar watches pushes and Git LFS locks and warns <span className="font-medium text-fg">#art</span> when a file is getting crowded.
      </p>

      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><TriangleAlert size={18} className="text-warn" /> Hotspots this week</h2>
        {hotspots.length === 0 ? (
          <p className="text-sm text-fg-muted">All clear: no unmergeable file has been touched by more than one person this week.</p>
        ) : (
          <ul className="stagger space-y-2">
            {hotspots.map((h) => (
              <li key={h.path} className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/5 p-3">
                <span className="relative flex h-3 w-3"><span className="absolute inset-0 animate-ping rounded-full bg-warn/70" /><span className="relative h-3 w-3 rounded-full bg-warn" /></span>
                <span className="font-mono text-sm font-semibold">{fileName(h.path)}</span>
                <span className="truncate font-mono text-xs text-fg-muted">{h.path}</span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                  {h.actors.map((a) => <span key={a} className="chip">@{a}</span>)}
                  {h.crossBranch && <span className="chip text-warn"><GitBranch size={11} /> {h.branches.join(" · ")}</span>}
                  <span className="text-fg-muted">{ago(h.lastAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><Lock size={18} className="text-accent" /> Git LFS locks</h2>
        {!githubConfigured() ? (
          <p className="text-sm text-fg-muted">This server has no GitHub App configured, so live locks are off (see docs/github-app.md).</p>
        ) : repos.length === 0 ? (
          <p className="text-sm text-fg-muted">Link a GitHub repo in Settings to see live locks.</p>
        ) : locks.length === 0 && lockErrors.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing is locked right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {locks.map((l) => (
              <li key={`${l.repoId}-${l.id}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <Lock size={14} className="text-fg-muted" />
                <span className="font-mono font-medium">{fileName(l.path)}</span>
                <span className="truncate font-mono text-xs text-fg-muted">{l.path}</span>
                <span className="chip">@{l.owner}</span>
                <span className="text-xs text-fg-muted">{ago(new Date(l.lockedAt))}</span>
                <span className="ml-auto"><LockActions slug={slug} lock={l} repoId={l.repoId} canForce={roleAtLeast(role, "lead")} /></span>
              </li>
            ))}
          </ul>
        )}
        {lockErrors.map((e) => <p key={e} className="text-xs text-bad">Couldn&apos;t read locks for {e}</p>)}
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Recently touched unmergeable files</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-fg-muted">No pushes touching binary assets in the last two weeks.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.map((t) => (
              <li key={t.path} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="truncate font-mono">{fileName(t.path)}</span>
                <span className="ml-auto shrink-0 text-xs text-fg-muted">@{t.actorLogin} · {t.branch} · {ago(t.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
