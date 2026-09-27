import { BarChart3, Bug, FlaskConical, Lightbulb, Map as MapIcon, MessageSquare, Users } from "lucide-react";
import { db } from "@/db";
import { SourceBars, StatChart } from "@/components/stat-chart";
import { loadProject } from "@/lib/access";
import { projectStats } from "@/lib/analytics-db";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Project analytics" };

export default async function ProjectAnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "contractor");
  const s = await projectStats(db, project.id, 30);
  const days = s.uniques.map((d) => d.day);
  const tiles = [
    { label: "Roadmap votes", value: s.roadmapVotes, icon: MapIcon },
    { label: "Playtest signups", value: s.playtestSignups, icon: FlaskConical },
    { label: "Bug reports", value: s.feedback.bug ?? 0, icon: Bug },
    { label: "Feedback", value: s.feedback.feedback ?? 0, icon: MessageSquare },
    { label: "Ideas", value: s.feedback.idea ?? 0, icon: Lightbulb },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1 flex items-center gap-2"><BarChart3 size={26} className="text-accent" /> Insights, last 30 days</h1>
        <p className="mt-1 text-sm text-fg-muted">How players and collaborators find {project.name}, and what they do next. {project.visibility === "private" && "Private projects have no public page, so there are no page views."}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <StatChart label="Unique visitors" values={s.uniques.map((d) => d.value)} days={days} />
        <StatChart label="Page views" values={s.views.map((d) => d.value)} days={days} accent="#22d3ee" />
      </div>
      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card flex flex-col gap-1">
            <t.icon size={18} className="text-accent" />
            <span className="font-display text-2xl font-bold tabular-nums">{t.value}</span>
            <span className="text-xs text-fg-muted">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="h2">Where visitors come from</h2>
          <SourceBars sources={s.sources} />
        </section>
        <section className="card space-y-3">
          <h2 className="h2 flex items-center gap-2"><Users size={18} className="text-accent" /> Applications per open role</h2>
          {s.roles.length === 0 ? <p className="text-sm text-fg-muted">No open roles.</p> : (
            <ul className="space-y-1.5 text-sm">{s.roles.map((r) => <li key={r.id} className="flex gap-2"><span className="flex-1 truncate">{r.title}</span><span className="font-semibold tabular-nums">{r.n}</span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
