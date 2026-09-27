import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, projectRepos, tasks, users } from "@/db/schema";
import { Bot, Lock, Workflow } from "lucide-react";
import { assignTaskToAgent } from "@/app/actions/agent";
import { githubConfigured } from "@/lib/env";
import { isStageLocked } from "@/lib/pipelines";
import { createTask, setTaskStatus } from "@/app/actions/workspace";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Tasks" };

const COLUMNS = [
  { id: "todo", label: "To do", color: "#9a96b3" },
  { id: "doing", label: "In progress", color: "#22d3ee" },
  { id: "done", label: "Done", color: "#34d399" },
] as const;

const AGENT_STATE = {
  requested: { label: "Agent working", color: "#a78bfa" },
  pr_open: { label: "Agent PR open", color: "#22d3ee" },
  merged: { label: "Agent PR merged", color: "#34d399" },
  closed: { label: "Agent PR closed", color: "#9a96b3" },
} as const;

function AgentBadge({ status, prUrl }: { status: keyof typeof AGENT_STATE; prUrl: string | null }) {
  const s = AGENT_STATE[status];
  const inner = (
    <>
      <Bot size={12} className={status === "requested" ? "animate-[bob_1.2s_ease-in-out_infinite]" : ""} /> {s.label}
    </>
  );
  const cls = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
  const style = { color: s.color, background: `color-mix(in oklab, ${s.color} 15%, transparent)` };
  return prUrl ? <a href={prUrl} target="_blank" rel="noreferrer" className={`${cls} hover:underline`} style={style}>{inner}</a> : <span className={cls} style={style}>{inner}</span>;
}

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const [rows, team, repos] = await Promise.all([
    db.select({ task: tasks, assignee: users }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId)).where(eq(tasks.projectId, project.id)).orderBy(asc(tasks.createdAt)),
    db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.projectId, project.id)),
    db.select({ repoId: projectRepos.repoId, fullName: projectRepos.fullName }).from(projectRepos).where(eq(projectRepos.projectId, project.id)),
  ]);
  // AI coding agent (C22): leads can hand open tasks to it once GitHub and a repo are linked.
  const canUseAgent = roleAtLeast(role, "lead") && githubConfigured() && repos.length > 0;
  const assign = assignTaskToAgent.bind(null, slug);
  const setStatus = setTaskStatus.bind(null, slug);
  const locked = new Set(
    rows
      .filter((r) => r.task.pipelineItemId && r.task.stageIndex != null)
      .filter((r) => isStageLocked(rows.filter((x) => x.task.pipelineItemId === r.task.pipelineItemId).sort((a, b) => a.task.stageIndex! - b.task.stageIndex!).map((x) => x.task.status), r.task.stageIndex!))
      .map((r) => r.task.id),
  );

  return (
    <div className="space-y-4">
      <form action={createTask.bind(null, slug)} className="flex flex-wrap gap-2">
        <input name="title" required placeholder="New task — e.g. Write Act 2 barks" className="input max-w-md" />
        <select name="assigneeId" className="input w-auto">
          <option value="">Unassigned</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="btn">Add task</button>
      </form>
      <p className="text-xs text-fg-muted">Issues from linked GitHub repos appear here automatically and close when the issue closes.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = rows.filter((r) => r.task.status === col.id);
          return (
            <section key={col.id} className="rounded-2xl border border-border bg-surface/50 p-3" style={{ borderTop: `3px solid ${col.color}` }}>
              <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                {col.label}
                <span className="ml-auto rounded-full bg-muted px-2 text-xs text-fg-muted">{items.length}</span>
              </h2>
              <ul className="stagger space-y-2">
                {items.map(({ task, assignee }) => (
                  <li key={task.id} className="card card-hover p-3">
                    <div className="flex items-start gap-1.5 text-sm font-medium">
                      {task.pipelineItemId && (locked.has(task.id) ? <Lock size={14} className="mt-0.5 shrink-0 text-fg-muted" /> : <Workflow size={14} className="mt-0.5 shrink-0 text-accent" />)}
                      {task.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      {assignee && <span>{assignee.name}</span>}
                      {task.ghUrl && <a href={task.ghUrl} target="_blank" rel="noreferrer" className="link">GitHub #{task.ghIssueNumber}</a>}
                      {task.agentStatus && <AgentBadge status={task.agentStatus} prUrl={task.agentPrUrl} />}
                    </div>
                    {canUseAgent && !task.pipelineItemId && task.status !== "done" && (!task.agentStatus || task.agentStatus === "closed") && (
                      <details className="group mt-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-fg-muted hover:text-accent"><Bot size={13} /> Assign to AI agent</summary>
                        <form action={assign} className="mt-2 space-y-2">
                          <input type="hidden" name="taskId" value={task.id} />
                          {!task.ghRepoId && repos.length > 1 && (
                            <select name="repoId" className="input py-1 text-xs" aria-label="Repository">
                              {repos.map((r) => <option key={r.repoId} value={r.repoId}>{r.fullName}</option>)}
                            </select>
                          )}
                          {!task.ghRepoId && repos.length === 1 && <input type="hidden" name="repoId" value={repos[0].repoId} />}
                          <textarea name="instructions" rows={3} className="input text-xs" placeholder={"Done when… (one per line)\nThe storm shader compiles for web\nNo new warnings in the export"} />
                          <button className="btn w-full py-1 text-xs"><Bot size={13} /> Send to agent</button>
                          <p className="text-[11px] text-fg-muted">Files the GitHub issue with a brief. The agent opens a PR for review; it can&apos;t merge.</p>
                        </form>
                      </details>
                    )}
                    {locked.has(task.id) ? <p className="mt-2 text-xs text-fg-muted">Locked until the previous stage is done</p> : <form action={setStatus} className="mt-2 flex gap-1">
                      <input type="hidden" name="id" value={task.id} />
                      {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                        <button key={c.id} name="status" value={c.id} className="btn-secondary px-2 py-0.5 text-xs">→ {c.label}</button>
                      ))}
                    </form>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
