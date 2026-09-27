import { and, desc, eq, gte, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { githubActivity, memberships, posts, tasks, users } from "@/db/schema";

export type DigestInput = {
  activity: { kind: string; actorLogin: string | null; title: string; url: string | null }[];
  tasksDone: { title: string }[];
  posts: { title: string }[];
  newMembers: { name: string }[];
};

export type Digest = {
  headline: string;
  counts: Record<"commits" | "prsMerged" | "prsOpened" | "issuesClosed" | "tasksDone" | "releases" | "ciFailures" | "posts" | "newMembers", number>;
  highlights: string[];
  topContributors: { login: string; events: number }[];
};

/** Summarise a week of project activity. Pure so it can be tested and reused for email later. */
export function buildDigest(input: DigestInput): Digest {
  const count = (kind: string) => input.activity.filter((a) => a.kind === kind).length;
  const counts = {
    // Push activity titles carry the commit count ("… pushed 3 commits to main").
    commits: input.activity
      .filter((a) => a.kind === "push")
      .reduce((n, a) => n + Number(/pushed (\d+) commit/.exec(a.title)?.[1] ?? 1), 0),
    prsMerged: count("pr_merged"),
    prsOpened: count("pr_opened"),
    issuesClosed: count("issue_closed"),
    tasksDone: input.tasksDone.length,
    releases: count("release"),
    ciFailures: count("ci_failed"),
    posts: input.posts.length,
    newMembers: input.newMembers.length,
  };

  const byActor = new Map<string, number>();
  for (const a of input.activity) if (a.actorLogin) byActor.set(a.actorLogin, (byActor.get(a.actorLogin) ?? 0) + 1);
  const topContributors = [...byActor.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([login, events]) => ({ login, events }));

  const highlights = [
    ...input.activity.filter((a) => a.kind === "release").map((a) => `Build shipped: ${a.title}`),
    ...input.activity.filter((a) => a.kind === "pr_merged").slice(0, 5).map((a) => `Merged: ${a.title}`),
    ...input.tasksDone.slice(0, 5).map((t) => `Done: ${t.title}`),
    ...input.posts.map((p) => `Devlog: ${p.title}`),
    ...input.newMembers.map((m) => `Welcome ${m.name} to the team`),
  ];

  const parts = [
    counts.prsMerged && `${counts.prsMerged} PR${counts.prsMerged === 1 ? "" : "s"} merged`,
    counts.tasksDone && `${counts.tasksDone} task${counts.tasksDone === 1 ? "" : "s"} done`,
    counts.releases && `${counts.releases} build${counts.releases === 1 ? "" : "s"}`,
    counts.newMembers && `${counts.newMembers} new member${counts.newMembers === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const headline = parts.length ? parts.join(" · ") : "A quiet week — no tracked activity.";

  return { headline, counts, highlights, topContributors };
}

export async function loadDigest(db: Db, projectId: string, since: Date): Promise<Digest> {
  const [activity, tasksDone, recentPosts, newMembers] = await Promise.all([
    db
      .select({ kind: githubActivity.kind, actorLogin: githubActivity.actorLogin, title: githubActivity.title, url: githubActivity.url })
      .from(githubActivity)
      .where(and(eq(githubActivity.projectId, projectId), gte(githubActivity.createdAt, since)))
      .orderBy(desc(githubActivity.createdAt)),
    db
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNotNull(tasks.completedAt), gte(tasks.completedAt, since))),
    db.select({ title: posts.title }).from(posts).where(and(eq(posts.projectId, projectId), gte(posts.createdAt, since))),
    db
      .select({ name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.projectId, projectId), gte(memberships.joinedAt, since), ne(memberships.role, "owner"))),
  ]);
  return buildDigest({ activity, tasksDone, posts: recentPosts, newMembers });
}
