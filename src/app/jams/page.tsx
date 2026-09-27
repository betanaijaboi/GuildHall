import { desc, eq, sql } from "drizzle-orm";
import { CalendarClock, Plus, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { jams, jamSeekers, jamTeams } from "@/db/schema";
import { JamCountdown } from "@/components/jam-countdown";
import { getCurrentUser } from "@/lib/auth";
import { jamPhase, type JamPhase } from "@/lib/jams";

export const metadata = { title: "Game jams" };

const PHASE: Record<JamPhase, { label: string; color: string }> = {
  running: { label: "Live now", color: "#34d399" },
  upcoming: { label: "Upcoming", color: "#22d3ee" },
  ended: { label: "Ended", color: "#9a96b3" },
};

export default async function JamsPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select({
      jam: jams,
      teams: sql<number>`(select count(*)::int from ${jamTeams} t where t.jam_id = "jams"."id")`,
      seekers: sql<number>`(select count(*)::int from ${jamSeekers} s where s.jam_id = "jams"."id")`,
    })
    .from(jams)
    .where(sql`${jams.endsAt} > now() - interval '60 days'`)
    .orderBy(desc(jams.startsAt));
  const now = new Date();
  const order: JamPhase[] = ["running", "upcoming", "ended"];
  const sorted = [...rows].sort((a, b) => order.indexOf(jamPhase(a.jam, now)) - order.indexOf(jamPhase(b.jam, now)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="h1">Game <span className="text-gradient">jams</span></h1>
          <p className="mt-1 text-sm text-fg-muted">Find a team in minutes, get a ready-made workspace, and ship something small by the deadline.</p>
        </div>
        {user && <Link href="/jams/new" className="btn ml-auto"><Plus size={16} /> Host a jam</Link>}
      </div>
      {sorted.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-fg-muted">
          <span className="animate-float text-5xl">🕹️</span>
          No jams yet. Host one, or mirror an itch.io jam to form teams here.
        </div>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {sorted.map(({ jam, teams, seekers }) => {
            const phase = jamPhase(jam, now);
            const p = PHASE[phase];
            return (
              <Link key={jam.id} href={`/jams/${jam.slug}`} className="card card-hover group space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: p.color, background: `color-mix(in oklab, ${p.color} 15%, transparent)` }}>
                    {phase === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: p.color }} />}
                    {p.label}
                  </span>
                  {jam.itchUrl && <span className="chip py-0 text-[11px]">on itch.io</span>}
                  <span className="ml-auto text-fg-muted">
                    {phase === "ended" ? <span className="text-xs">{jam.endsAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}</span> : <JamCountdown compact target={(phase === "running" ? jam.endsAt : jam.startsAt).toISOString()} label={phase === "running" ? "ends in" : "starts in"} />}
                  </span>
                </div>
                <h2 className="font-display text-xl font-bold tracking-tight group-hover:text-accent">{jam.name}</h2>
                <p className="line-clamp-2 text-sm text-fg-muted">{jam.description || "No description yet."}</p>
                <div className="flex gap-4 text-xs text-fg-muted">
                  <span className="flex items-center gap-1"><Trophy size={13} /> {teams} team{teams === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><Users size={13} /> {seekers} looking for a team</span>
                  <span className="flex items-center gap-1"><CalendarClock size={13} /> {Math.round((jam.endsAt.getTime() - jam.startsAt.getTime()) / 3_600_000)}h</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
