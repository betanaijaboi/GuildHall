import { GitCommitHorizontal, GitMerge, GitPullRequest, CircleCheck, ListChecks, Package, XCircle, Newspaper, UserPlus, Send, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { postDigestToGeneral } from "@/app/actions/workspace";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadDigest } from "@/lib/digest";

export const metadata = { title: "Weekly digest" };

const ICONS: Record<string, [LucideIcon, string]> = {
  commits: [GitCommitHorizontal, "#22d3ee"], prsMerged: [GitMerge, "#a78bfa"], prsOpened: [GitPullRequest, "#34d399"], issuesClosed: [CircleCheck, "#60a5fa"],
  tasksDone: [ListChecks, "#f472b6"], releases: [Package, "#fbbf24"], ciFailures: [XCircle, "#fb7185"], posts: [Newspaper, "#fb923c"], newMembers: [UserPlus, "#34d399"],
};

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
  const { project, role } = await loadProject(slug, user, "contractor");
  const digest = await loadDigest(db, project.id, new Date(Date.now() - 7 * 86_400_000));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="h1">This week in <span className="text-gradient">{project.name}</span></h1>
          <p className="text-fg-muted">{digest.headline}</p>
        </div>
        {roleAtLeast(role, "member") && (
          <form action={postDigestToGeneral.bind(null, slug)} className="ml-auto">
            <button className="btn-secondary"><Send size={15} /> Post to #general</button>
          </form>
        )}
      </div>
      <dl className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(digest.counts).map(([k, v]) => {
          const [Icon, color] = ICONS[k];
          return (
            <div key={k} className="card card-hover p-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
                <Icon size={18} />
              </span>
              <dd className="mt-3 font-display text-3xl font-bold">{v}</dd>
              <dt className="text-xs text-fg-muted">{LABELS[k]}</dt>
            </div>
          );
        })}
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
