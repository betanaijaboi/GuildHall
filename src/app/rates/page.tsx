import { eq } from "drizzle-orm";
import { EyeOff, Scale } from "lucide-react";
import { db } from "@/db";
import { rateReports } from "@/db/schema";
import { deleteRate, submitRate } from "@/app/actions/rates";
import { SkillChip } from "@/components/discipline";
import { SkillSelect } from "@/components/skill-picker";
import { getCurrentUser } from "@/lib/auth";
import { isInsufficient, MIN_SAMPLE, regionFromTimezone, REGIONS } from "@/lib/rates";
import { gigPriceSummary, rateSummary } from "@/lib/rates-db";
import { isSkillId, SENIORITIES, skillLabel } from "@/lib/taxonomy";

export const metadata = { title: "Rates" };

const usd = (c: number) => `$${(c / 100).toFixed(0)}`;

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ skill?: string; seniority?: string; region?: string }> }) {
  const q = await searchParams;
  const user = await getCurrentUser();
  const skill = q.skill && isSkillId(q.skill) ? q.skill : "art.environment";
  const seniority = SENIORITIES.find((s) => s === q.seniority);
  const region = REGIONS.find((r) => r.id === q.region)?.id;
  const [summary, gigs, mine] = await Promise.all([
    rateSummary(db, skill, { seniority, region }),
    gigPriceSummary(db, skill),
    user ? db.select().from(rateReports).where(eq(rateReports.userId, user.id)) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="h1 flex items-center gap-2"><Scale className="text-accent" /> Rate <span className="text-gradient">transparency</span></h1>
        <p className="mt-1 max-w-2xl text-fg-muted">Anonymous hourly rates shared by game makers, so juniors don&apos;t undercharge and studios budget realistically. Figures appear only when {MIN_SAMPLE}+ people contributed.</p>
      </div>

      <form className="card grid gap-3 sm:grid-cols-[1fr_180px_180px_auto] sm:items-end" method="get">
        <div><label className="label">Specialisation</label><SkillSelect name="skill" defaultValue={skill} /></div>
        <div>
          <label className="label" htmlFor="seniority">Seniority</label>
          <select id="seniority" name="seniority" defaultValue={seniority ?? ""} className="input"><option value="">Any</option>{SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="region">Region</label>
          <select id="region" name="region" defaultValue={region ?? ""} className="input"><option value="">Anywhere</option>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </div>
        <button className="btn">Show</button>
      </form>

      <section className="card space-y-4">
        <div className="flex items-center gap-2"><SkillChip skillId={skill} /><span className="text-sm text-fg-muted">{seniority ?? "all levels"} · {REGIONS.find((r) => r.id === region)?.label ?? "worldwide"}</span></div>
        {isInsufficient(summary) ? (
          <div className="flex items-center gap-3 text-fg-muted">
            <EyeOff size={20} />
            <div>
              <div>Not enough reports yet: {summary.n} of {MIN_SAMPLE} needed before anything is shown.</div>
              <div className="xp-bar mt-2 w-64"><span style={{ width: `${(summary.n / MIN_SAMPLE) * 100}%` }} /></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["Lower quartile", summary.p25], ["Median", summary.median], ["Upper quartile", summary.p75]].map(([label, v]) => (
              <div key={label as string} className="rounded-2xl bg-muted/50 p-4">
                <div className="font-display text-3xl font-bold">{usd(v as number)}<span className="text-base font-normal text-fg-muted">/h</span></div>
                <div className="text-xs text-fg-muted">{label}</div>
              </div>
            ))}
            <div className="col-span-3 text-xs text-fg-muted">{summary.n} anonymous reports</div>
          </div>
        )}
        {gigs.medianBasic != null && <p className="text-sm text-fg-muted">Fixed-price gigs for {skillLabel(skill)} start around <span className="font-semibold text-fg">{usd(gigs.medianBasic)}</span> (median Basic tier, {gigs.n} gig{gigs.n === 1 ? "" : "s"}).</p>}
      </section>

      {user && (
        <section className="card space-y-3">
          <h2 className="h2">Share your rate anonymously</h2>
          <p className="text-sm text-fg-muted">Your name is never shown. Only aggregates of {MIN_SAMPLE}+ reports are published, and you can delete your report anytime. Report in USD.</p>
          <form action={submitRate} className="grid gap-2 sm:grid-cols-[1fr_140px_160px_120px_auto]">
            <SkillSelect name="skillId" defaultValue={skill} required />
            <select name="seniority" defaultValue={user.seniority ?? "mid"} className="input">{SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select name="region" defaultValue={regionFromTimezone(user.timezone) ?? "eu"} className="input">{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
            <input name="hourly" required placeholder="$/hour" className="input" />
            <button className="btn">Share</button>
          </form>
          {mine.length > 0 && (
            <ul className="space-y-1 text-sm">
              {mine.map((r) => (
                <li key={r.skillId} className="flex items-center gap-2">
                  <SkillChip skillId={r.skillId} /> <span className="text-fg-muted">{r.seniority} · {REGIONS.find((x) => x.id === r.region)?.label} · {usd(r.hourlyUsdCents)}/h</span>
                  <form action={deleteRate} className="ml-auto"><input type="hidden" name="skillId" value={r.skillId} /><button className="text-xs text-fg-muted hover:text-bad">Delete</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
