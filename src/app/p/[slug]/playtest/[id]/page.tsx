import { and, eq } from "drizzle-orm";
import { CheckCircle2, Download, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { playtests, playtestTesters } from "@/db/schema";
import { joinPlaytestAction, submitPlaytestFeedbackAction } from "@/app/actions/playtests";
import { loadProject } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { buildLinkFor } from "@/lib/feedback-db";

export const metadata = { title: "Playtest" };

export default async function PlaytestPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ thanks?: string }> }) {
  const { slug, id } = await params;
  const { thanks } = await searchParams;
  const user = await getCurrentUser();
  const { project } = await loadProject(slug, user);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [pt] = await db.select().from(playtests).where(and(eq(playtests.id, id), eq(playtests.projectId, project.id))).limit(1);
  if (!pt) notFound();
  const [tester] = user ? await db.select().from(playtestTesters).where(and(eq(playtestTesters.playtestId, pt.id), eq(playtestTesters.userId, user.id))).limit(1) : [];
  const build = tester ? await buildLinkFor(db, pt) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="card space-y-2">
        <div className="flex items-center gap-2 text-sm text-accent"><FlaskConical size={16} /> Playtest</div>
        <h1 className="h1">{pt.title}</h1>
        {pt.description && <p className="whitespace-pre-wrap text-sm text-fg-muted">{pt.description}</p>}
      </div>

      {!tester ? (
        !pt.open ? (
          <p className="card text-sm text-fg-muted">Signups for this playtest are closed.</p>
        ) : !user ? (
          <p className="card text-sm">Sign in to join the playtest. <Link href={`/login?next=/p/${slug}/playtest/${pt.id}`} className="link">Sign in</Link></p>
        ) : (
          <form action={joinPlaytestAction.bind(null, slug, pt.id)} className="card flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="label" htmlFor="platform">What will you play on?</label>
              <select id="platform" name="platform" className="input">
                {["Windows", "macOS", "Linux", "Steam Deck", "Web", "Android", "iOS"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <button className="btn">Join the playtest</button>
          </form>
        )
      ) : (
        <>
          <div className="card flex flex-wrap items-center gap-3">
            <CheckCircle2 size={18} className="text-good" />
            <span className="text-sm">You&apos;re a tester.</span>
            {build ? (
              <a href={build} target="_blank" rel="noreferrer" className="btn ml-auto"><Download size={16} /> Get the build</a>
            ) : (
              <span className="ml-auto text-sm text-fg-muted">The team hasn&apos;t posted a build yet.</span>
            )}
          </div>
          {thanks && <p className="card animate-pop border-emerald-400/40 text-sm text-good">🎉 Thanks! Your feedback went straight to the team. Send more any time.</p>}
          <form action={submitPlaytestFeedbackAction.bind(null, slug, pt.id)} className="card space-y-4">
            <h2 className="h2">Your feedback</h2>
            {pt.questions.map((q) => (
              <fieldset key={q.id} className="space-y-1.5">
                <legend className="label">{q.prompt}</legend>
                {q.kind === "rating" ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input type="radio" name={q.id} value={n} className="peer sr-only" />
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-sm font-semibold transition peer-checked:scale-110 peer-checked:border-accent peer-checked:bg-accent/20 peer-focus-visible:outline peer-focus-visible:outline-2">{n}</span>
                      </label>
                    ))}
                  </div>
                ) : q.kind === "choice" ? (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <label key={o} className="cursor-pointer">
                        <input type="radio" name={q.id} value={o} className="peer sr-only" />
                        <span className="chip px-3 py-1.5 text-sm peer-checked:border-accent peer-checked:text-fg peer-focus-visible:outline peer-focus-visible:outline-2">{o}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea name={q.id} rows={2} maxLength={2000} className="input" />
                )}
              </fieldset>
            ))}
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <select name="kind" className="input" aria-label="Type">
                <option value="feedback">Feedback</option>
                <option value="bug">Bug</option>
                <option value="idea">Idea</option>
              </select>
              <input name="title" maxLength={160} placeholder="Short summary (optional)" className="input" />
            </div>
            <textarea name="body" rows={4} maxLength={8000} placeholder="Anything else? For bugs: what happened, and how to make it happen again." className="input" />
            <input type="hidden" name="platform" value={tester.platform} />
            <button className="btn w-full">Send feedback</button>
          </form>
        </>
      )}
    </div>
  );
}
