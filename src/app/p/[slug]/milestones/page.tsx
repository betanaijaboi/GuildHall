import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { milestones } from "@/db/schema";
import { addChecklistItem, completeMilestone, toggleChecklistItem } from "@/app/actions/workspace";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/taxonomy";

export const metadata = { title: "Milestones" };

export default async function MilestonesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const list = await db.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(desc(milestones.createdAt));
  const stageIndex = STAGES.findIndex((s) => s.id === project.stage);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-1 text-xs">
        {STAGES.map((s, i) => (
          <li key={s.id} className={`rounded-full px-2.5 py-1 ${i < stageIndex ? "bg-accent/20" : i === stageIndex ? "bg-accent text-accent-fg" : "bg-muted text-fg-muted"}`}>
            {s.label}
          </li>
        ))}
      </ol>
      {list.map((m) => {
        const done = m.checklist.filter((c) => c.done).length;
        return (
          <section key={m.id} className="card space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="h2">{m.title}</h2>
              <span className="text-sm text-fg-muted">{done}/{m.checklist.length}</span>
              {m.completedAt && <span className="chip text-good">Completed {m.completedAt.toLocaleDateString("en-GB")}</span>}
            </div>
            <ul className="space-y-1">
              {m.checklist.map((item, i) => (
                <li key={i}>
                  <form action={toggleChecklistItem.bind(null, slug)}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="index" value={i} />
                    <button disabled={!!m.completedAt || !roleAtLeast(role, "member")} className="flex items-center gap-2 text-left text-sm disabled:cursor-default">
                      <span aria-hidden className={`inline-flex h-4 w-4 items-center justify-center rounded border ${item.done ? "border-accent bg-accent text-accent-fg" : "border-border"}`}>
                        {item.done ? "✓" : ""}
                      </span>
                      <span className={item.done ? "text-fg-muted line-through" : ""}>{item.text}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {!m.completedAt && roleAtLeast(role, "member") && (
              <div className="flex flex-wrap gap-2">
                <form action={addChecklistItem.bind(null, slug)} className="flex gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="text" required placeholder="Add checklist item" className="input w-64" />
                  <button className="btn-secondary">Add</button>
                </form>
                {roleAtLeast(role, "lead") && (
                  <form action={completeMilestone.bind(null, slug)} className="ml-auto">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn">Complete milestone</button>
                  </form>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
