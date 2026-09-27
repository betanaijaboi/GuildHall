import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Bug, ExternalLink, FlaskConical, Gamepad2, KeyRound, Lightbulb, ListTodo, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { feedbackKeys, feedbackReports, playtests, playtestTesters, projectRepos } from "@/db/schema";
import { createFeedbackKeyAction, createPlaytest, reportToIssueAction, reportToTaskAction, revokeFeedbackKey, setPlaytestOpen, setReportDismissed } from "@/app/actions/playtests";
import { GithubIcon } from "@/components/icons";
import { FeedbackKeyForm } from "@/components/sharing-forms";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { env, githubConfigured } from "@/lib/env";
import { summarise } from "@/lib/feedback";

export const metadata = { title: "Playtests" };

const KIND = {
  bug: { icon: Bug, color: "#fb7185", label: "Bug", plural: "Bugs" },
  feedback: { icon: MessageSquare, color: "#22d3ee", label: "Feedback", plural: "Feedback" },
  idea: { icon: Lightbulb, color: "#fbbf24", label: "Idea", plural: "Ideas" },
} as const;

export default async function PlaytestsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ kind?: string; status?: string }> }) {
  const { slug } = await params;
  const { kind, status } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const isLead = roleAtLeast(role, "lead");
  const canTriage = roleAtLeast(role, "member");

  const [tests, reports, keys, repo] = await Promise.all([
    db
      .select({ pt: playtests, testers: sql<number>`(select count(*)::int from ${playtestTesters} t where t.playtest_id = ${playtests.id})` })
      .from(playtests)
      .where(eq(playtests.projectId, project.id))
      .orderBy(desc(playtests.createdAt)),
    db
      .select()
      .from(feedbackReports)
      .where(and(eq(feedbackReports.projectId, project.id), ...(kind && kind in KIND ? [eq(feedbackReports.kind, kind as keyof typeof KIND)] : []), ...(status === "open" ? [eq(feedbackReports.status, "new")] : status === "done" ? [inArray(feedbackReports.status, ["issue", "task", "dismissed"])] : [])))
      .orderBy(desc(feedbackReports.createdAt))
      .limit(100),
    isLead ? db.select().from(feedbackKeys).where(eq(feedbackKeys.projectId, project.id)).orderBy(desc(feedbackKeys.createdAt)) : Promise.resolve([]),
    db.select({ id: projectRepos.repoId }).from(projectRepos).where(eq(projectRepos.projectId, project.id)).limit(1),
  ]);
  const answersFor = await Promise.all(tests.map(({ pt }) => db.select({ answers: feedbackReports.answers }).from(feedbackReports).where(eq(feedbackReports.playtestId, pt.id))));
  const canIssue = githubConfigured() && repo.length > 0;
  const endpoint = `${env.appUrl}/api/feedback`;
  const filter = (k?: string, s?: string) => `?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(s ? { status: s } : {}) })}`;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="h2 flex items-center gap-2"><FlaskConical size={20} className="text-accent" /> Playtests</h2>
        {tests.length === 0 && <p className="text-sm text-fg-muted">No playtests yet. Run one to get structured feedback from players.</p>}
        {tests.map(({ pt, testers }, i) => (
          <div key={pt.id} className="card space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-semibold">{pt.title}</span>
              <span className={`chip py-0 text-[11px] ${pt.open ? "chip-tint" : ""}`}>{pt.open ? "open" : "closed"}</span>
              <span className="text-xs text-fg-muted">{testers}/{pt.maxTesters} testers · {answersFor[i].length} responses</span>
              <Link href={`/p/${slug}/playtest/${pt.id}`} className="btn-ghost ml-auto text-sm">Tester page <ExternalLink size={13} /></Link>
              {isLead && (
                <form action={setPlaytestOpen.bind(null, slug)}>
                  <input type="hidden" name="id" value={pt.id} />
                  <button name="open" value={pt.open ? "0" : "1"} className="btn-secondary py-1 text-xs">{pt.open ? "Close signups" : "Reopen"}</button>
                </form>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {summarise(pt.questions, answersFor[i].map((a) => a.answers)).map((s) => (
                <div key={s.q.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="mb-2 font-medium">{s.q.prompt} <span className="text-xs font-normal text-fg-muted">({s.n})</span></div>
                  {s.kind === "rating" && (
                    <div className="space-y-1">
                      <div className="font-display text-2xl font-bold">{s.average ?? "–"}<span className="text-sm font-normal text-fg-muted"> / 5</span></div>
                      <div className="flex h-10 items-end gap-1">
                        {s.counts.map((c, r) => (
                          <div key={r} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                            <div className="w-full rounded-t bg-gradient-to-t from-violet-500 to-cyan-400 transition-[height] duration-700" style={{ height: `${s.n && c ? Math.max(3, Math.round((c / Math.max(...s.counts)) * 28)) : 2}px`, opacity: c ? 1 : 0.3 }} title={`${c} × ${r + 1}`} />
                            <span className="text-[10px] text-fg-muted">{r + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.kind === "choice" && (
                    <ul className="space-y-1">
                      {Object.entries(s.counts).map(([o, c]) => (
                        <li key={o} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 truncate text-xs">{o}</span>
                          <span className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${s.n ? (c / s.n) * 100 : 0}%`, minWidth: 4 }} />
                          <span className="text-xs text-fg-muted">{c}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.kind === "text" && (s.answers.length ? <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-fg-muted">{s.answers.map((a, k) => <li key={k}>“{a}”</li>)}</ul> : <p className="text-xs text-fg-muted">No answers yet.</p>)}
                </div>
              ))}
            </div>
          </div>
        ))}
        {isLead && (
          <details className="card">
            <summary className="cursor-pointer font-display font-semibold">+ New playtest</summary>
            <form action={createPlaytest.bind(null, slug)} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                <input name="title" required minLength={3} maxLength={120} placeholder="Vertical slice playtest #2" className="input" />
                <input name="maxTesters" type="number" min={1} max={10000} defaultValue={50} className="input" aria-label="Max testers" />
              </div>
              <textarea name="description" rows={2} className="input" placeholder="What should testers focus on? How long does it take?" />
              <input name="buildUrl" className="input" placeholder="Build link (https). Leave empty to use the latest GitHub release" />
              <div>
                <label className="label" htmlFor="questions">Questions <span className="font-normal text-fg-muted">(one per line: rating / text / choice)</span></label>
                <textarea id="questions" name="questions" rows={4} className="input font-mono text-sm" defaultValue={"rating: How fun was the core loop?\ntext: Where did you get stuck or confused?\nchoice: Would you wishlist it? | Yes | Maybe | No"} />
              </div>
              <button className="btn">Start playtest</button>
            </form>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="h2">Feedback inbox</h2>
          <div className="ml-auto flex flex-wrap gap-1.5 text-sm">
            <Link href={filter(undefined, status)} className={`chip ${!kind ? "border-accent text-fg" : ""}`}>All</Link>
            {Object.entries(KIND).map(([k, v]) => <Link key={k} href={filter(k, status)} className={`chip ${kind === k ? "border-accent text-fg" : ""}`}>{v.plural}</Link>)}
            <span className="mx-1 w-px bg-border" />
            <Link href={filter(kind, "open")} className={`chip ${status === "open" ? "border-accent text-fg" : ""}`}>Untriaged</Link>
            <Link href={filter(kind, "done")} className={`chip ${status === "done" ? "border-accent text-fg" : ""}`}>Triaged</Link>
          </div>
        </div>
        {reports.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-fg-muted"><span className="animate-float text-4xl">🧪</span>Nothing here yet. Playtest forms and in-game reports land in this inbox.</div>
        ) : (
          <ul className="stagger space-y-2">
            {reports.map((r) => {
              const k = KIND[r.kind];
              return (
                <li key={r.id} id={r.id} className={`card space-y-2 ${r.status === "dismissed" ? "opacity-60" : ""}`} data-testid="report">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: k.color, background: `color-mix(in oklab, ${k.color} 15%, transparent)` }}><k.icon size={15} /></span>
                    <span className="font-medium">{r.title}</span>
                    <span className="chip py-0 text-[11px]">{r.source === "sdk" ? <><Gamepad2 size={11} /> in-game</> : r.source === "discord" ? "Discord" : "playtest form"}</span>
                    {r.status !== "new" && <span className="chip py-0 text-[11px]">{r.status === "issue" ? "issue" : r.status === "task" ? "task" : "dismissed"}</span>}
                    <span className="ml-auto text-xs text-fg-muted">{r.reporterName || "anonymous"} · {r.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {r.body && <p className="whitespace-pre-wrap text-sm text-fg-muted">{r.body}</p>}
                  {(r.build || r.platform) && <p className="font-mono text-xs text-fg-muted">{[r.build && `build ${r.build}`, r.platform].filter(Boolean).join(" · ")}</p>}
                  {r.screenshotKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={`/api/feedback/${r.id}/screenshot`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${r.id}/screenshot`} alt="Screenshot from the player" className="max-h-48 rounded-lg border border-border" /></a>
                  )}
                  {canTriage && (
                    <div className="flex flex-wrap gap-2">
                      {r.issueUrl ? (
                        <a href={r.issueUrl} target="_blank" rel="noreferrer" className="btn-ghost py-1 text-xs"><GithubIcon size={13} /> View issue</a>
                      ) : canIssue && r.status !== "dismissed" ? (
                        <form action={reportToIssueAction.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className="btn-secondary py-1 text-xs"><GithubIcon size={13} /> Open GitHub issue</button></form>
                      ) : null}
                      {r.taskId ? (
                        <Link href={`/p/${slug}/tasks`} className="btn-ghost py-1 text-xs"><ListTodo size={13} /> On the board</Link>
                      ) : r.status !== "dismissed" ? (
                        <form action={reportToTaskAction.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className="btn-secondary py-1 text-xs"><ListTodo size={13} /> Add task</button></form>
                      ) : null}
                      <form action={setReportDismissed.bind(null, slug)}>
                        <input type="hidden" name="id" value={r.id} />
                        <button name="dismiss" value={r.status === "dismissed" ? "0" : "1"} className="btn-ghost py-1 text-xs"><X size={13} /> {r.status === "dismissed" ? "Restore" : "Dismiss"}</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isLead && (
        <section className="card space-y-3">
          <h2 className="h2 flex items-center gap-2"><KeyRound size={18} className="text-accent" /> In-game reporter</h2>
          <p className="text-sm text-fg-muted">Let players file bugs from inside your build (with a screenshot). Create a key per build, then POST reports to <code>{endpoint}</code>.</p>
          <FeedbackKeyForm action={createFeedbackKeyAction.bind(null, slug)} endpoint={endpoint} />
          {keys.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {keys.map((k) => (
                <li key={k.keyHash} className="flex items-center gap-2 px-3 py-2">
                  <span className="font-medium">{k.label}</span>
                  <code className="text-xs text-fg-muted">{k.prefix}…</code>
                  <span className="text-xs text-fg-muted">{k.lastUsedAt ? `last report ${k.lastUsedAt.toLocaleDateString("en-GB")}` : "unused"}</span>
                  <form action={revokeFeedbackKey.bind(null, slug)} className="ml-auto"><input type="hidden" name="keyHash" value={k.keyHash} /><button className="btn-ghost py-1 text-xs text-bad">Revoke</button></form>
                </li>
              ))}
            </ul>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Examples: curl, Godot, Unity</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ghfb_…" -H "Content-Type: application/json" \\
  -d '{"kind":"bug","title":"Fell through the dock","description":"Near the lighthouse","build":"0.4.1","platform":"Windows","player":"Sam"}'

# Godot 4 (GDScript)
var img := get_viewport().get_texture().get_image()
var body := JSON.stringify({"kind": "bug", "title": title, "description": text,
  "build": ProjectSettings.get_setting("application/config/version"), "platform": OS.get_name(),
  "screenshot": Marshalls.raw_to_base64(img.save_png_to_buffer())})
$HTTPRequest.request("${endpoint}", ["Authorization: Bearer " + KEY, "Content-Type: application/json"], HTTPClient.METHOD_POST, body)

// Unity (C#)
var tex = ScreenCapture.CaptureScreenshotAsTexture();
var json = JsonUtility.ToJson(new Report { kind = "bug", title = title, description = text, build = Application.version,
  platform = Application.platform.ToString(), screenshot = System.Convert.ToBase64String(tex.EncodeToPNG()) });
var req = new UnityWebRequest("${endpoint}", "POST") { uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)), downloadHandler = new DownloadHandlerBuffer() };
req.SetRequestHeader("Authorization", "Bearer " + Key); req.SetRequestHeader("Content-Type", "application/json");
yield return req.SendWebRequest();`}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
