import { db } from "@/db";
import { postDigestToGeneral } from "@/app/actions/workspace";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadDigest } from "@/lib/digest";

export const metadata = { title: "Weekly digest" };

const LABELS: Record<string, string> = {
  commits: "Commits",
  prsMerged: "PRs merged",
  prsOpened: "PRs opened",
  issuesClosed: "Issues closed",
  tasksDone: "Tasks done",
  releases: "Builds",
  ciFailures: "CI failures",
  posts: "Updates",
  newMembers: "New members",
};

export default async function DigestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const digest = await loadDigest(db, project.id, new Date(Date.now() - 7 * 86_400_000));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="h1">Last 7 days</h1>
          <p className="text-fg-muted">{digest.headline}</p>
        </div>
        {roleAtLeast(role, "member") && (
          <form action={postDigestToGeneral.bind(null, slug)} className="ml-auto">
            <button className="btn-secondary">Post to #general</button>
          </form>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Object.entries(digest.counts).map(([k, v]) => (
          <div key={k} className="card p-3">
            <dt className="text-xs text-fg-muted">{LABELS[k]}</dt>
            <dd className={`text-2xl font-semibold ${k === "ciFailures" && v > 0 ? "text-bad" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <section className="card">
        <h2 className="h2 mb-2">Highlights</h2>
        {digest.highlights.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing yet. Link a GitHub repo in Settings to track code activity automatically.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">{digest.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        )}
      </section>
      {digest.topContributors.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">Most active on GitHub</h2>
          <ul className="space-y-1 text-sm">
            {digest.topContributors.map((c) => <li key={c.login}>@{c.login} — {c.events} event{c.events === 1 ? "" : "s"}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
