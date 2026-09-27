import { and, asc, eq, ne } from "drizzle-orm";
import { CheckCircle2, CircleDashed, ListTodo, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { channelLinks, huddleCaptions, huddleParticipants, memberships, projects, users } from "@/db/schema";
import { createRecapTasksAction } from "@/app/actions/huddles";
import { Avatar } from "@/components/avatar";
import { HuddleRoom } from "@/components/huddle-room";
import { getRole, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadHuddle } from "@/lib/huddle-server";
import { MAX_PARTICIPANTS } from "@/lib/huddles";
import { activeParticipants } from "@/lib/huddles-db";

export const metadata = { title: "Huddle" };

function iceServers(): RTCIceServer[] {
  try {
    if (process.env.HUDDLE_ICE_SERVERS) return JSON.parse(process.env.HUDDLE_ICE_SERVERS);
  } catch {
    console.warn("HUDDLE_ICE_SERVERS is not valid JSON; using the public STUN server");
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

export default async function HuddlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const row = await loadHuddle(id, user.id);
  if (!row) notFound();
  const { huddle, channel } = row;

  // Back to the channel as this person sees it: the owning project, or theirs if it's shared in.
  const ownRole = await getRole(channel.projectId, user.id);
  let backHref = "/projects";
  if (ownRole) {
    const [p] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, channel.projectId)).limit(1);
    backHref = `/p/${p.slug}/workspace/${channel.name}`;
  } else {
    const [p] = await db
      .select({ slug: projects.slug })
      .from(channelLinks)
      .innerJoin(projects, eq(projects.id, channelLinks.projectId))
      .innerJoin(memberships, and(eq(memberships.projectId, projects.id), eq(memberships.userId, user.id), ne(memberships.role, "guest")))
      .where(eq(channelLinks.channelId, channel.id))
      .limit(1);
    if (p) backHref = `/p/${p.slug}/workspace/shared-${channel.id}`;
  }

  if (!huddle.endedAt) {
    const present = await activeParticipants(db, id);
    if (present.length >= MAX_PARTICIPANTS && !present.some((p) => p.id === user.id)) {
      return (
        <div className="mx-auto max-w-md py-16 text-center">
          <span className="animate-float text-5xl">🎧</span>
          <h1 className="h1 mt-4">This huddle is full</h1>
          <p className="mt-2 text-sm text-fg-muted">Huddles connect everyone directly, so they hold up to {MAX_PARTICIPANTS} people.</p>
          <Link href={backHref} className="btn mt-6">Back to chat</Link>
        </div>
      );
    }
    // Avatars for everyone who could join (the channel's project), so tiles render before media arrives.
    const people = await db.select({ id: users.id, handle: users.handle, name: users.name, avatarUrl: users.avatarUrl, avatar: users.avatar }).from(users).innerJoin(memberships, eq(memberships.userId, users.id)).where(eq(memberships.projectId, channel.projectId));
    return (
      <HuddleRoom
        huddleId={id}
        me={{ id: user.id, handle: user.handle, name: user.name, avatarUrl: user.avatarUrl, avatar: user.avatar }}
        users={Object.fromEntries(people.map((p) => [p.id, p]))}
        iceServers={iceServers()}
        initialNotes={huddle.notes}
        channelLabel={`#${channel.name}`}
        backHref={backHref}
      />
    );
  }

  // Ended: the recap.
  const [people, caps] = await Promise.all([
    db.select({ user: users }).from(huddleParticipants).innerJoin(users, eq(users.id, huddleParticipants.userId)).where(eq(huddleParticipants.huddleId, id)).orderBy(asc(huddleParticipants.joinedAt)),
    db.select({ text: huddleCaptions.text, name: users.name }).from(huddleCaptions).leftJoin(users, eq(users.id, huddleCaptions.userId)).where(eq(huddleCaptions.huddleId, id)).orderBy(asc(huddleCaptions.at)),
  ]);
  const recap = huddle.recap;
  const canAddTasks = roleAtLeast(ownRole, "member");
  const minutes = Math.max(1, Math.round((huddle.endedAt.getTime() - huddle.startedAt.getTime()) / 60_000));
  const open = recap?.actions.map((a, i) => ({ ...a, i })).filter((a) => !a.taskId) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Huddle recap</h1>
        <span className="chip">#{channel.name}</span>
        <span className="chip">{minutes} min</span>
        {recap && <span className="chip">{recap.source === "ai" ? <><Sparkles size={12} /> Claude</> : "rule-based"}</span>}
        <Link href={backHref} className="btn-ghost ml-auto text-sm">Back to chat</Link>
      </div>
      <div className="flex -space-x-2">
        {people.map(({ user: u }) => <Avatar key={u.id} user={u} size={36} />)}
      </div>
      {!recap ? (
        <div className="card flex items-center gap-3 text-sm text-fg-muted"><CircleDashed size={18} className="animate-spin" /> Writing the recap… refresh in a moment.</div>
      ) : (
        <>
          <section className="card animate-fade-up space-y-2">
            <h2 className="h2 flex items-center gap-2"><ScrollText size={18} className="text-accent" /> Summary</h2>
            <p className="text-sm leading-relaxed">{recap.summary}</p>
          </section>
          <section className="card animate-fade-up space-y-2">
            <h2 className="h2 flex items-center gap-2"><CheckCircle2 size={18} className="text-good" /> Decisions</h2>
            {recap.decisions.length ? (
              <ul className="space-y-1.5 text-sm">{recap.decisions.map((d, i) => <li key={i} className="flex gap-2"><span className="text-good">✔</span>{d}</li>)}</ul>
            ) : <p className="text-sm text-fg-muted">No decisions were recorded.</p>}
          </section>
          <section className="card animate-fade-up space-y-3">
            <h2 className="h2 flex items-center gap-2"><ListTodo size={18} className="text-accent" /> Follow-ups</h2>
            {recap.actions.length === 0 ? (
              <p className="text-sm text-fg-muted">No follow-ups found. Next time, write &quot;TODO&quot; lines in the shared notes or turn on captions.</p>
            ) : (
              <form action={createRecapTasksAction.bind(null, id)} className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {recap.actions.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                      {a.taskId ? (
                        <CheckCircle2 size={16} className="text-good" />
                      ) : canAddTasks ? (
                        <input type="checkbox" name="action" value={i} defaultChecked className="accent-violet-500" aria-label={`Add "${a.title}" as a task`} />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="flex-1">{a.title}</span>
                      {a.owner && <span className="chip py-0 text-[11px]">@{a.owner}</span>}
                      {a.taskId && <span className="text-xs text-good">on the board</span>}
                    </li>
                  ))}
                </ul>
                {canAddTasks && open.length > 0 && <button className="btn"><ListTodo size={16} /> Add {open.length === 1 ? "task" : "selected as tasks"}</button>}
              </form>
            )}
          </section>
        </>
      )}
      {huddle.notes.trim() && (
        <details className="card">
          <summary className="cursor-pointer font-display font-semibold">Shared notes</summary>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-sm text-fg-muted">{huddle.notes}</pre>
        </details>
      )}
      {caps.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-display font-semibold">Captions ({caps.length})</summary>
          <ul className="mt-3 space-y-1 text-sm">{caps.map((c, i) => <li key={i}><span className="font-semibold">{c.name ?? "Someone"}:</span> {c.text}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
