import { and, count, eq, inArray } from "drizzle-orm";
import { ChevronUp, EyeOff, Lightbulb, Map as MapIcon, Rocket } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { roadmapItems, roadmapVotes, tasks } from "@/db/schema";
import { addRoadmapItem, suggestIdeaAction, updateRoadmapItem, voteRoadmapItem } from "@/app/actions/roadmap";
import { loadProject, roleAtLeast } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { COLUMNS, canVote, rankItems } from "@/lib/roadmap";

export const metadata = { title: "Roadmap" };

const TASK_STATE = { todo: "not started", doing: "in progress", done: "done" } as const;

export default async function RoadmapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const { project, role } = await loadProject(slug, user);
  const isLead = roleAtLeast(role, "lead");
  const isTeam = roleAtLeast(role, "contractor");

  const items = await db.select().from(roadmapItems).where(and(eq(roadmapItems.projectId, project.id), ...(isTeam ? [] : [eq(roadmapItems.public, true)])));
  const ids = items.map((i) => i.id);
  const [votes, mine, linked, openTasks] = await Promise.all([
    ids.length ? db.select({ id: roadmapVotes.itemId, n: count() }).from(roadmapVotes).where(inArray(roadmapVotes.itemId, ids)).groupBy(roadmapVotes.itemId) : [],
    ids.length && user ? db.select({ id: roadmapVotes.itemId }).from(roadmapVotes).where(and(inArray(roadmapVotes.itemId, ids), eq(roadmapVotes.userId, user.id))) : [],
    isTeam && items.some((i) => i.taskId) ? db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.id, items.map((i) => i.taskId).filter((x): x is string => !!x))) : [],
    isLead ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.projectId, project.id), inArray(tasks.status, ["todo", "doing"]))).limit(200) : [],
  ]);
  const voteMap = new Map(votes.map((v) => [v.id, v.n]));
  const mineSet = new Set(mine.map((m) => m.id));
  const taskMap = new Map(linked.map((t) => [t.id, t.status]));
  const board = rankItems(items.map((i) => ({ ...i, votes: voteMap.get(i.id) ?? 0 })));
  const vote = voteRoadmapItem.bind(null, slug);
  const update = updateRoadmapItem.bind(null, slug);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1 flex items-center gap-2"><MapIcon size={26} className="text-accent" /> Roadmap</h1>
        <p className="mt-1 text-sm text-fg-muted">What {project.name} is working on. Upvote what you want most; the team reads every vote.</p>
      </div>

      <div className="scroll-x -mx-4 grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-4 px-4 pb-2 md:mx-0 md:grid-flow-row md:grid-cols-4 md:px-0">
        {COLUMNS.map((col) => (
          <section key={col.id} className="space-y-2 rounded-2xl border border-border bg-surface/50 p-3" style={{ borderTop: `3px solid ${col.color}` }} data-testid={`col-${col.id}`}>
            <h2 className="flex items-baseline gap-2 px-1">
              <span className="font-display font-semibold">{col.label}</span>
              <span className="text-xs text-fg-muted">{col.hint}</span>
              <span className="ml-auto rounded-full bg-muted px-2 text-xs text-fg-muted">{board[col.id].length}</span>
            </h2>
            <ul className="stagger space-y-2">
              {board[col.id].map((item) => (
                <li key={item.id} className={`card flex gap-3 p-3 ${item.public ? "" : "border-dashed"}`} data-testid="roadmap-item">
                  {canVote(item.column) && item.public ? (
                    user ? (
                      <form action={vote}>
                        <input type="hidden" name="id" value={item.id} />
                        <button aria-pressed={mineSet.has(item.id)} aria-label={`Upvote ${item.title}`} className={`flex w-11 flex-col items-center rounded-xl border py-1 text-xs font-semibold transition active:scale-90 ${mineSet.has(item.id) ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:border-accent hover:text-fg"}`}>
                          <ChevronUp size={16} /> {item.votes}
                        </button>
                      </form>
                    ) : (
                      <Link href={`/login?next=/p/${slug}/roadmap`} className="flex w-11 flex-col items-center rounded-xl border border-border py-1 text-xs font-semibold text-fg-muted" title="Sign in to vote"><ChevronUp size={16} /> {item.votes}</Link>
                    )
                  ) : item.column === "shipped" ? (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400"><Rocket size={18} /></span>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start gap-1.5 text-sm font-medium">
                      {!item.public && <EyeOff size={13} className="mt-0.5 shrink-0 text-fg-muted" aria-label="Team only" />}
                      {item.title}
                    </div>
                    {item.description && <p className="text-xs text-fg-muted">{item.description}</p>}
                    {item.column === "shipped" && item.shippedAt && <p className="text-[11px] text-amber-400">Shipped {item.shippedAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}{item.votes ? ` · ${item.votes} votes` : ""}</p>}
                    {isTeam && item.taskId && taskMap.get(item.taskId) && <p className="text-[11px] text-fg-muted">Task: {TASK_STATE[taskMap.get(item.taskId)!]}</p>}
                    {isLead && (
                      <form action={update} className="flex flex-wrap gap-1 pt-1">
                        <input type="hidden" name="id" value={item.id} />
                        {COLUMNS.filter((c) => c.id !== item.column).map((c) => (
                          <button key={c.id} name="column" value={c.id} className="btn-secondary px-1.5 py-0 text-[11px]">→ {c.label}</button>
                        ))}
                        <button name="public" value={item.public ? "0" : "1"} className="btn-ghost px-1.5 py-0 text-[11px]">{item.public ? "Hide" : "Publish"}</button>
                        <button name="delete" value="1" className="btn-ghost px-1.5 py-0 text-[11px] text-bad">Delete</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
              {board[col.id].length === 0 && <li className="px-1 py-4 text-center text-xs text-fg-muted">Nothing here yet</li>}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isLead && (
          <form action={addRoadmapItem.bind(null, slug)} className="card space-y-3">
            <h2 className="h2">Add to the roadmap</h2>
            <input name="title" required minLength={2} maxLength={120} placeholder="Co-op sailing" className="input" />
            <textarea name="description" rows={2} maxLength={2000} placeholder="One or two lines players will understand" className="input" />
            <div className="grid gap-2 sm:grid-cols-3">
              <select name="column" defaultValue="next" className="input" aria-label="Column">{COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              <select name="taskId" defaultValue="" className="input sm:col-span-2" aria-label="Linked task">
                <option value="">No linked task</option>
                {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" value="0" className="accent-violet-500" /> Team only for now</label>
            <button className="btn">Add item</button>
          </form>
        )}
        {user && !isTeam && (
          <form action={suggestIdeaAction.bind(null, slug)} className="card space-y-3">
            <h2 className="h2 flex items-center gap-2"><Lightbulb size={18} className="text-amber-400" /> Suggest an idea</h2>
            <input name="title" required minLength={3} maxLength={160} placeholder="Let me name my boat" className="input" />
            <textarea name="body" rows={2} maxLength={4000} placeholder="Why would it make the game better for you?" className="input" />
            <button className="btn-secondary">Send to the team</button>
          </form>
        )}
      </div>
    </div>
  );
}
