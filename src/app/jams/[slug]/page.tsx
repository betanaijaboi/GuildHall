import { and, asc, eq, inArray } from "drizzle-orm";
import { ExternalLink, Lock, Send, Sparkles, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { jamRequests, jams, jamSeekers, jamTeams, memberships, projects, users } from "@/db/schema";
import { formTeamAction, postSeeker, removeSeeker, requestToJoinAction, respondToRequestAction, submitEntryAction } from "@/app/actions/jams";
import { Avatar } from "@/components/avatar";
import { SkillChip } from "@/components/discipline";
import { JamCountdown } from "@/components/jam-countdown";
import { JamRolePicker } from "@/components/jam-roles";
import { getCurrentUser } from "@/lib/auth";
import { jamPhase, visibleTheme } from "@/lib/jams";
import { teamOf } from "@/lib/jams-db";
import { ENGINES } from "@/lib/taxonomy";

const fmt = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default async function JamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [jam] = await db.select().from(jams).where(eq(jams.slug, slug)).limit(1);
  if (!jam) notFound();
  const user = await getCurrentUser();
  const now = new Date();
  const phase = jamPhase(jam, now);
  const theme = visibleTheme(jam, user?.id ?? null, now);
  const [host] = jam.hostId ? await db.select().from(users).where(eq(users.id, jam.hostId)).limit(1) : [];

  const [teams, seekers, mine] = await Promise.all([
    db.select({ team: jamTeams, project: projects }).from(jamTeams).innerJoin(projects, eq(projects.id, jamTeams.projectId)).where(eq(jamTeams.jamId, jam.id)).orderBy(asc(jamTeams.createdAt)),
    db.select({ seeker: jamSeekers, user: users }).from(jamSeekers).innerJoin(users, eq(users.id, jamSeekers.userId)).where(eq(jamSeekers.jamId, jam.id)).orderBy(asc(jamSeekers.createdAt)),
    user ? teamOf(db, jam.id, user.id) : null,
  ]);
  const projectIds = teams.map((t) => t.project.id);
  const members = projectIds.length
    ? await db.select({ projectId: memberships.projectId, user: users }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(inArray(memberships.projectId, projectIds)).orderBy(asc(memberships.joinedAt))
    : [];
  const myRequests = user ? await db.select().from(jamRequests).where(eq(jamRequests.userId, user.id)) : [];
  const incoming = mine && mine.project.ownerId === user?.id
    ? await db.select({ req: jamRequests, user: users }).from(jamRequests).innerJoin(users, eq(users.id, jamRequests.userId)).where(and(eq(jamRequests.teamId, mine.team.id), eq(jamRequests.status, "pending")))
    : [];
  const iAmSeeking = seekers.some((s) => s.user.id === user?.id);
  const open = phase !== "ended";
  const submissions = teams.filter((t) => t.team.submissionUrl);

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <Link href="/jams" className="hover:text-accent">Jams</Link>
              <span>/</span>
              {host && <span className="flex items-center gap-1.5">hosted by <Avatar user={host} size={18} /> {host.name}</span>}
              {jam.itchUrl && <a href={jam.itchUrl} target="_blank" rel="noreferrer" className="chip py-0 hover:border-accent">itch.io <ExternalLink size={11} /></a>}
            </div>
            <h1 className="h1">{jam.name}</h1>
            <p className="whitespace-pre-wrap text-sm text-fg-muted">{jam.description}</p>
            <p className="text-xs text-fg-muted">
              {fmt(jam.startsAt)} → {fmt(jam.endsAt)} UTC · teams of up to {jam.maxTeamSize}
            </p>
          </div>
          {phase === "ended" ? (
            <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"><Trophy size={18} className="text-amber-400" /> Jam over · {submissions.length} entr{submissions.length === 1 ? "y" : "ies"}</div>
          ) : (
            <JamCountdown target={(phase === "running" ? jam.endsAt : jam.startsAt).toISOString()} label={phase === "running" ? "Time left" : "Starts in"} />
          )}
        </div>
        <div className="relative mt-5 rounded-2xl border border-dashed border-accent/40 bg-gradient-to-r from-violet-500/10 to-cyan-500/5 p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted">Theme</div>
          {theme ? (
            <div className="animate-pop mt-1 font-display text-3xl font-bold tracking-tight text-gradient">{theme}</div>
          ) : jam.theme ? (
            <div className="mt-1 flex items-center justify-center gap-2 text-fg-muted"><Lock size={16} className="animate-[wobble_2.5s_ease-in-out_infinite]" /> Revealed when the jam starts</div>
          ) : (
            <div className="mt-1 text-fg-muted">No theme: make anything</div>
          )}
          {user?.id === jam.hostId && phase === "upcoming" && jam.theme && <div className="mt-1 text-[11px] text-fg-muted">Only you can see this until the start.</div>}
        </div>
      </header>

      {user && (
        <section className="grid gap-4 lg:grid-cols-2">
          {mine ? (
            <div className="card space-y-3 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <Sparkles size={18} className="text-accent" />
                <span className="font-display text-lg font-semibold">Your team: {mine.project.name}</span>
                <Link href={`/p/${mine.project.slug}/workspace/general`} className="btn ml-auto">Open workspace</Link>
              </div>
              {mine.project.ownerId === user.id && phase !== "upcoming" && (jam.itchUrl || phase === "running") && (
                <form action={submitEntryAction.bind(null, slug)} className="flex flex-wrap gap-2">
                  <input type="hidden" name="teamId" value={mine.team.id} />
                  <input name="url" required defaultValue={mine.team.submissionUrl ?? ""} placeholder={jam.itchUrl ? "https://you.itch.io/your-game" : "https://… (build or page link)"} className="input flex-1" />
                  <button className="btn-secondary"><Send size={15} /> {mine.team.submissionUrl ? "Update entry" : "Submit entry"}</button>
                </form>
              )}
              {mine.team.submissionUrl && <p className="text-sm text-good">✔ Submitted: <a href={mine.team.submissionUrl} target="_blank" rel="noreferrer" className="link">{mine.team.submissionUrl}</a></p>}
              {incoming.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Join requests</h3>
                  {incoming.map(({ req, user: u }) => (
                    <form key={u.id} action={respondToRequestAction.bind(null, slug)} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                      <input type="hidden" name="teamId" value={mine.team.id} />
                      <input type="hidden" name="userId" value={u.id} />
                      <Avatar user={u} size={30} />
                      <Link href={`/people/${u.handle}`} className="text-sm font-medium hover:underline">{u.name}</Link>
                      {req.message && <span className="text-sm text-fg-muted">“{req.message}”</span>}
                      <button name="accept" value="1" className="btn ml-auto py-1 text-xs">Accept</button>
                      <button name="accept" value="0" className="btn-ghost py-1 text-xs">Decline</button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ) : open ? (
            <>
              <form action={formTeamAction.bind(null, slug)} className="card space-y-3">
                <h2 className="h2 flex items-center gap-2"><Users size={18} className="text-accent" /> Start a team</h2>
                <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                  <input name="name" required minLength={2} maxLength={60} placeholder="Team name" className="input" />
                  <select name="engine" className="input" defaultValue="godot">
                    {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div className="text-xs font-medium text-fg-muted">Looking for</div>
                <JamRolePicker name="lookingFor" />
                <button className="btn w-full">Create team + workspace</button>
              </form>
              <form action={postSeeker.bind(null, slug)} className="card space-y-3">
                <h2 className="h2 flex items-center gap-2"><UserPlus size={18} className="text-accent" /> {iAmSeeking ? "Your board post" : "Looking for a team?"}</h2>
                <textarea name="note" rows={2} maxLength={400} className="input" placeholder="Pixel artist, 6h/day, into cozy games…" defaultValue={seekers.find((s) => s.user.id === user.id)?.seeker.note} />
                <div className="text-xs font-medium text-fg-muted">I can do</div>
                <JamRolePicker name="skill" selected={seekers.find((s) => s.user.id === user.id)?.seeker.skills ?? []} />
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1">{iAmSeeking ? "Update post" : "Post on the board"}</button>
                  {iAmSeeking && <button formAction={removeSeeker.bind(null, slug)} className="btn-ghost">Remove</button>}
                </div>
              </form>
            </>
          ) : null}
        </section>
      )}
      {!user && open && <p className="card text-sm">Sign in to find a team. <Link href={`/login?next=/jams/${slug}`} className="link">Sign in</Link></p>}

      {submissions.length > 0 && (
        <section className="space-y-3">
          <h2 className="h2 flex items-center gap-2"><Trophy size={18} className="text-amber-400" /> Entries</h2>
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map(({ team, project }) => (
              <a key={team.id} href={team.submissionUrl!} target="_blank" rel="noreferrer" className="card card-hover space-y-2">
                <div className="flex items-center gap-2 font-display font-semibold">{project.name} <ExternalLink size={13} className="text-fg-muted" /></div>
                <div className="flex -space-x-2">{members.filter((m) => m.projectId === project.id).map((m) => <Avatar key={m.user.id} user={m.user} size={26} />)}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="h2">Teams <span className="text-sm font-normal text-fg-muted">{teams.length}</span></h2>
          {teams.length === 0 && <p className="text-sm text-fg-muted">No teams yet. Start one!</p>}
          {teams.map(({ team, project }) => {
            const crew = members.filter((m) => m.projectId === project.id);
            const full = crew.length >= jam.maxTeamSize;
            const requested = myRequests.find((r) => r.teamId === team.id);
            return (
              <div key={team.id} className="card space-y-2" data-testid="jam-team">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold">{project.name}</span>
                  <span className={`chip py-0 text-[11px] ${full ? "" : "chip-tint"}`}>{crew.length}/{jam.maxTeamSize}{full ? " full" : ""}</span>
                  <div className="ml-auto flex -space-x-2">{crew.map((m) => <Avatar key={m.user.id} user={m.user} size={26} />)}</div>
                </div>
                {team.lookingFor.length > 0 && !full && <div className="flex flex-wrap gap-1">{team.lookingFor.map((s) => <SkillChip key={s} skillId={s} prefix="needs" />)}</div>}
                {user && !mine && open && !full && (
                  requested?.status === "pending" ? (
                    <p className="text-xs text-fg-muted">Request sent. Waiting for the founder.</p>
                  ) : requested?.status === "declined" ? (
                    <p className="text-xs text-fg-muted">They passed this time.</p>
                  ) : (
                    <form action={requestToJoinAction.bind(null, slug)} className="flex gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input name="message" maxLength={500} placeholder="Say hi and what you'd bring…" className="input py-1 text-sm" />
                      <button className="btn-secondary shrink-0 py-1 text-sm">Ask to join</button>
                    </form>
                  )
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-3">
          <h2 className="h2">Looking for a team <span className="text-sm font-normal text-fg-muted">{seekers.length}</span></h2>
          {seekers.length === 0 && <p className="text-sm text-fg-muted">Nobody on the board yet.</p>}
          {seekers.map(({ seeker, user: u }) => (
            <div key={u.id} className="card flex gap-3" data-testid="jam-seeker">
              <Avatar user={u} size={40} />
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/people/${u.handle}`} className="font-medium hover:underline">{u.name}</Link>
                {seeker.note && <p className="text-sm text-fg-muted">{seeker.note}</p>}
                <div className="flex flex-wrap gap-1">{seeker.skills.map((s) => <SkillChip key={s} skillId={s} />)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
