import { desc, eq } from "drizzle-orm";
import { Pause, Play, Trash2, Zap } from "lucide-react";
import { db } from "@/db";
import { automations, channels } from "@/db/schema";
import { deleteAutomation, enableTemplate, toggleAutomation } from "@/app/actions/automations";
import { AutomationBuilder } from "@/components/automation-builder";
import { loadProject, roleAtLeast } from "@/lib/access";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { actionSchema, describeAction, describeTrigger, TEMPLATES, triggerSchema } from "@/lib/automations";

export const metadata = { title: "Automations" };

export default async function AutomationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const isLead = roleAtLeast(role, "lead");
  const [rules, chans] = await Promise.all([
    db.select().from(automations).where(eq(automations.projectId, project.id)).orderBy(desc(automations.createdAt)),
    db.select({ name: channels.name }).from(channels).where(eq(channels.projectId, project.id)),
  ]);
  const enabledTemplates = new Set(rules.filter((r) => r.source === "template").map((r) => r.name));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {isLead && <AutomationBuilder slug={slug} channels={chans.map((c) => c.name)} aiEnabled={aiConfigured()} />}
        <section className="space-y-2">
          <h2 className="h2">Rules ({rules.length})</h2>
          {rules.length === 0 && <p className="text-sm text-fg-muted">No automations yet. Start from a template →</p>}
          <ul className="stagger space-y-2">
            {rules.map((r) => {
              const t = triggerSchema.safeParse(r.trigger);
              const a = actionSchema.safeParse(r.action);
              return (
                <li key={r.id} className={`card flex items-start gap-3 p-4 ${r.enabled ? "" : "opacity-60"}`}>
                  <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${r.enabled ? "bg-gold/15 text-gold" : "bg-muted text-fg-muted"}`}><Zap size={18} className={r.enabled ? "fill-current" : ""} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{r.name} {r.source === "ai" && <span className="chip ml-1">drafted by Claude</span>}</div>
                    <div className="text-sm text-fg-muted"><span className="font-medium text-fg">When</span> {t.success ? describeTrigger(t.data) : "?"} <span className="font-medium text-fg">then</span> {a.success ? describeAction(a.data) : "?"}</div>
                    <div className="mt-1 text-xs text-fg-muted">Fired {r.fireCount} time{r.fireCount === 1 ? "" : "s"}{r.lastFiredAt ? ` · last ${r.lastFiredAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}</div>
                  </div>
                  {isLead && (
                    <div className="flex gap-1">
                      <form action={toggleAutomation.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost" aria-label={r.enabled ? "Pause" : "Resume"}>{r.enabled ? <Pause size={15} /> : <Play size={15} />}</button></form>
                      <form action={deleteAutomation.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost hover:text-bad" aria-label="Delete"><Trash2 size={15} /></button></form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <aside className="card h-fit space-y-3">
        <h2 className="h2">Templates</h2>
        <ul className="space-y-2">
          {TEMPLATES.map((t, i) => (
            <li key={t.name} className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-fg-muted">When {describeTrigger(t.trigger)}, {describeAction(t.action)}</div>
              {isLead && (
                enabledTemplates.has(t.name)
                  ? <div className="mt-2 text-xs text-good">✓ Added</div>
                  : <form action={enableTemplate.bind(null, slug)} className="mt-2"><input type="hidden" name="index" value={i} /><button className="btn-secondary py-1 text-xs"><Zap size={13} /> Add</button></form>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-muted">Weekly rules run from an hourly cron (<code>/api/cron/automations</code>).</p>
      </aside>
    </div>
  );
}
