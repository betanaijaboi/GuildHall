import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { Check, ExternalLink, ImageIcon, Lock, Play, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { assets, memberships, pipelineItems, projectRepos, tasks, users } from "@/db/schema";
import { setTaskStatus } from "@/app/actions/workspace";
import { assignStage, createPipelineItem, deletePipelineItem } from "@/app/actions/pipelines";
import { Avatar } from "@/components/avatar";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { PIPELINE_TEMPLATES, progress, stageStates, type StageState } from "@/lib/pipelines";

export const metadata = { title: "Pipelines" };

const STATE_STYLE: Record<StageState, string> = {
  done: "border-good/40 bg-good/15 text-good",
  doing: "border-accent-2/50 bg-accent-2/15 text-accent-2",
  ready: "border-border bg-surface-2 text-fg",
  locked: "border-dashed border-border bg-transparent text-fg-muted opacity-60",
};

export default async function PipelinesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const [items, stageRows, team, projectAssets, [repo]] = await Promise.all([
    db.select({ item: pipelineItems, asset: assets }).from(pipelineItems).leftJoin(assets, eq(assets.id, pipelineItems.assetId)).where(eq(pipelineItems.projectId, project.id)).orderBy(desc(pipelineItems.createdAt)),
    db
      .select({ task: tasks, assignee: users })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.projectId, project.id), isNotNull(tasks.pipelineItemId)))
      .orderBy(asc(tasks.stageIndex)),
    db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.projectId, project.id)),
    db.select({ id: assets.id, title: assets.title }).from(assets).where(eq(assets.projectId, project.id)).orderBy(desc(assets.updatedAt)),
    db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id)).limit(1),
  ]);
  const canEdit = roleAtLeast(role, "member");
  const byTemplate = PIPELINE_TEMPLATES.map((t) => ({ template: t, rows: items.filter((i) => i.item.template === t.id) })).filter((g) => g.rows.length);

  return (
    <div className="space-y-6">
      {canEdit && (
        <form action={createPipelineItem.bind(null, slug)} className="card grid gap-3 md:grid-cols-[1fr_220px_220px_auto] md:items-end">
          <div>
            <label className="label" htmlFor="name">New asset</label>
            <input id="name" name="name" required maxLength={100} placeholder="e.g. Captain Mara, Harbour district, Storm theme" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="template">Pipeline</label>
            <select id="template" name="template" className="input">
              {PIPELINE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.label} ({t.stages.length} stages)</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="assetId">Linked review (optional)</label>
            <select id="assetId" name="assetId" className="input">
              <option value="">None</option>
              {projectAssets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          <button className="btn"><Workflow size={16} /> Start pipeline</button>
        </form>
      )}

      {byTemplate.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-14 text-center text-fg-muted">
          <span className="animate-float text-5xl">🛠️</span>
          <p className="max-w-md">Define an asset once and every stage becomes a task that unlocks in order. Approving a linked asset review completes the current stage.</p>
        </div>
      )}

      {byTemplate.map(({ template, rows }) => (
        <section key={template.id} className="card space-y-3 overflow-hidden">
          <h2 className="h2">{template.emoji} {template.label} <span className="text-sm font-normal text-fg-muted">· {rows.length}</span></h2>
          <div className="scroll-x">
            <table className="w-full min-w-[720px] border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-muted">
                  <th className="w-48 font-medium">Asset</th>
                  {template.stages.map((s, i) => <th key={s} className="font-medium">{i + 1}. {s}</th>)}
                </tr>
              </thead>
              <tbody className="stagger">
                {rows.map(({ item, asset }) => {
                  const stages = stageRows.filter((r) => r.task.pipelineItemId === item.id);
                  const states = stageStates(stages.map((s) => s.task.status));
                  const pct = progress(stages.map((s) => s.task.status));
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="pr-2">
                        <div className="font-medium">{item.name}</div>
                        <div className="xp-bar mt-1.5 h-1.5"><span style={{ width: `${pct}%` }} /></div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                          <span>{pct}%</span>
                          {asset && <Link href={`/p/${slug}/assets/${asset.id}`} className="inline-flex items-center gap-1 hover:text-accent"><ImageIcon size={12} /> review</Link>}
                          {item.ghParentIssueNumber && repo && (
                            <a href={`https://github.com/${repo.fullName}/issues/${item.ghParentIssueNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                              <ExternalLink size={12} /> #{item.ghParentIssueNumber}
                            </a>
                          )}
                          {roleAtLeast(role, "lead") && (
                            <form action={deletePipelineItem.bind(null, slug)}>
                              <input type="hidden" name="id" value={item.id} />
                              <button className="hover:text-bad" aria-label="Delete pipeline"><Trash2 size={12} /></button>
                            </form>
                          )}
                        </div>
                      </td>
                      {stages.map(({ task, assignee }, i) => {
                        const state = states[i];
                        return (
                          <td key={task.id}>
                            <details className="group">
                              <summary className={`flex min-h-16 cursor-pointer list-none flex-col gap-1.5 rounded-xl border p-2 transition-transform hover:-translate-y-0.5 ${STATE_STYLE[state]}`}>
                                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                                  {state === "done" ? <Check size={12} /> : state === "locked" ? <Lock size={12} /> : state === "doing" ? <Play size={12} /> : null}
                                  {state === "ready" ? "ready" : state}
                                </span>
                                {assignee ? (
                                  <span className="flex items-center gap-1.5 text-xs text-fg"><Avatar user={assignee} size={20} /> <span className="truncate">{assignee.name.split(" ")[0]}</span></span>
                                ) : (
                                  <span className="text-xs text-fg-muted">unassigned</span>
                                )}
                              </summary>
                              {canEdit && (
                                <div className="mt-1 min-w-44 animate-pop space-y-2 rounded-xl border border-border bg-surface p-3 shadow-2xl">
                                  <div className="text-xs font-semibold">{template.stages[i]}</div>
                                  <form action={assignStage.bind(null, slug)} className="flex gap-1">
                                    <input type="hidden" name="taskId" value={task.id} />
                                    <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="input py-1 text-xs">
                                      <option value="">Unassigned</option>
                                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <button className="btn-secondary px-2 py-1 text-xs">Set</button>
                                  </form>
                                  {state !== "locked" && (
                                    <form action={setTaskStatus.bind(null, slug)} className="flex gap-1">
                                      <input type="hidden" name="id" value={task.id} />
                                      {state !== "doing" && state !== "done" && <button name="status" value="doing" className="btn-secondary flex-1 px-2 py-1 text-xs">Start</button>}
                                      {state !== "done" && <button name="status" value="done" className="btn flex-1 px-2 py-1 text-xs">Done</button>}
                                      {state === "done" && <button name="status" value="todo" className="btn-secondary flex-1 px-2 py-1 text-xs">Reopen</button>}
                                    </form>
                                  )}
                                  {state === "locked" && <p className="text-xs text-fg-muted">Unlocks when the previous stage is done.</p>}
                                  {task.ghUrl && <a href={task.ghUrl} target="_blank" rel="noreferrer" className="link text-xs">GitHub #{task.ghIssueNumber}</a>}
                                </div>
                              )}
                            </details>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
