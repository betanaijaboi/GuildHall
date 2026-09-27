import { BarChart3, MousePointerClick } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { SourceBars, StatChart } from "@/components/stat-chart";
import { profileStats } from "@/lib/analytics-db";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Profile analytics" };

export default async function ProfileAnalyticsPage() {
  const user = await requireUser();
  const s = await profileStats(db, user.id, 30);
  const days = s.uniques.map((d) => d.day);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="h1 flex items-center gap-2"><BarChart3 size={26} className="text-accent" /> Your profile, last 30 days</h1>
        <p className="mt-1 text-sm text-fg-muted">Who&apos;s finding <Link href={`/people/${user.handle}`} className="link">your profile</Link> and which work they open. Visitors are counted privately: no cookies, no IP addresses stored.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <StatChart label="Unique visitors" values={s.uniques.map((d) => d.value)} days={days} />
        <StatChart label="Profile views" values={s.views.map((d) => d.value)} days={days} accent="#22d3ee" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="h2">Where visitors come from</h2>
          <SourceBars sources={s.sources} />
        </section>
        <section className="card space-y-3">
          <h2 className="h2 flex items-center gap-2"><MousePointerClick size={18} className="text-accent" /> Portfolio click-throughs</h2>
          {s.clicks.length === 0 ? <p className="text-sm text-fg-muted">Add portfolio pieces in <Link href="/settings/profile" className="link">your profile</Link> to see which get opened.</p> : (
            <ul className="space-y-1.5 text-sm">
              {s.clicks.map((c) => <li key={c.id} className="flex gap-2"><span className="flex-1 truncate">{c.title}</span><span className="font-semibold tabular-nums">{c.n}</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
