import { desc, eq } from "drizzle-orm";
import { Check, Flag, Plus, Trophy } from "lucide-react";
import { db } from "@/db";
import { milestones } from "@/db/schema";
import { addChecklistItem, completeMilestone, toggleChecklistItem } from "@/app/actions/workspace";
import { Confetti } from "@/components/confetti";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/taxonomy";

export const metadata = { title: "Quest log" };

export default async function MilestonesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ celebrate?: string }> }) {
  const { slug } = await params;
  const { celebrate } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const list = await db.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(desc(milestones.createdAt));
  const stageIndex = STAGES.findIndex((s) => s.id === project.stage);

  return (
    <div className="space-y-6">
      {celebrate && <Confetti />}
      <section className="card">
        <div className="mb-4 flex items-center gap-2">
          <Flag size={18} className="text-accent" />
          <h2 className="h2">Pipeline</h2>
          <span className="ml-auto text-sm text-fg-muted">Stage {stageIndex + 1} of {STAGES.length}</span>
        </div>
        <ol className="scroll-x flex items-center pb-1">
          {STAGES.map((s, i) => {
            const done = i < stageIndex;
            const current = i === stageIndex;
            return (
              <li key={s.id} className="flex shrink-0 items-center">
                <div className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <span
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-gradient-to-br from-violet-500 to-cyan-500 text-white" : current ? "bg-surface-2 text-accent ring-2 ring-accent" : "bg-muted text-fg-muted"
                    }`}
                  >
                    {done ? <Check size={16} /> : i + 1}
                    {current && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-accent/60" />}
                  </span>
                  <span className={`text-[11px] leading-tight ${current ? "font-semibold text-fg" : "text-fg-muted"}`}>{s.label}</span>
                </div>
                {i < STAGES.length - 1 && <span className={`mb-5 h-0.5 w-6 rounded-full ${done ? "bg-accent" : "bg-border"}`} />}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="stagger space-y-4">
        {list.map((m) => {
          const done = m.checklist.filter((c) => c.done).length;
          const pct = m.checklist.length ? Math.round((done / m.checklist.length) * 100) : 0;
          return (
            <section key={m.id} className={`card space-y-4 ${m.completedAt ? "opacity-80" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${m.completedAt ? "bg-gold/15 text-gold" : "bg-accent/15 text-accent"}`}>
                  {m.completedAt ? <Trophy size={20} /> : <Flag size={20} />}
                </span>
                <div>
                  <h2 className="h2">{m.title}</h2>
                  <div className="text-xs text-fg-muted">
                    {m.completedAt ? `Completed ${m.completedAt.toLocaleDateString("en-GB")}` : `${done} of ${m.checklist.length} objectives`}
                  </div>
                </div>
                <span className="ml-auto font-display text-2xl font-bold text-gradient">{pct}%</span>
              </div>
              <div className="xp-bar"><span style={{ width: `${pct}%` }} /></div>
              <ul className="space-y-1">
                {m.checklist.map((item, i) => (
                  <li key={i}>
                    <form action={toggleChecklistItem.bind(null, slug)}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="index" value={i} />
                      <button
                        disabled={!!m.completedAt || !roleAtLeast(role, "member")}
                        className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors enabled:hover:bg-muted disabled:cursor-default"
                      >
                        <span
                          aria-hidden
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                            item.done ? "scale-100 border-transparent bg-gradient-to-br from-violet-500 to-cyan-500 text-white" : "border-border group-enabled:group-hover:border-accent"
                          }`}
                        >
                          {item.done && <Check size={13} strokeWidth={3} className="animate-pop" />}
                        </span>
                        <span className={item.done ? "text-fg-muted line-through" : ""}>{item.text}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              {!m.completedAt && roleAtLeast(role, "member") && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <form action={addChecklistItem.bind(null, slug)} className="flex flex-1 gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="text" required placeholder="Add an objective" className="input max-w-sm" />
                    <button className="btn-secondary" aria-label="Add objective"><Plus size={16} /></button>
                  </form>
                  {roleAtLeast(role, "lead") && (
                    <form action={completeMilestone.bind(null, slug)}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="btn"><Trophy size={16} /> Complete milestone</button>
                    </form>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
