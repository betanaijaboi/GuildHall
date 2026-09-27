import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tasks, users } from "@/db/schema";
import { Lock, Workflow } from "lucide-react";
import { isStageLocked } from "@/lib/pipelines";
import { createTask, setTaskStatus } from "@/app/actions/workspace";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Tasks" };

const COLUMNS = [
  { id: "todo", label: "To do", color: "#9a96b3" },
  { id: "doing", label: "In progress", color: "#22d3ee" },
  { id: "done", label: "Done", color: "#34d399" },
] as const;

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");
  const [rows, team] = await Promise.all([
    db.select({ task: tasks, assignee: users }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId)).where(eq(tasks.projectId, project.id)).orderBy(asc(tasks.createdAt)),
    db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.projectId, project.id)),
  ]);
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
                    </div>
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
