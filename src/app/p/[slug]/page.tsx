import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { applications, memberships, milestones, posts, roleListings, users } from "@/db/schema";
import { applyToListing } from "@/app/actions/project";
import { Avatar } from "@/components/avatar";
import { loadProject } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { ENGAGEMENTS, labelFor, PLATFORMS, skillLabel } from "@/lib/taxonomy";

export default async function ProjectPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ applied?: string }>;
}) {
  const { slug } = await params;
  const { applied } = await searchParams;
  const user = await getCurrentUser();
  const { project, role } = await loadProject(slug, user);

  const [team, listings, devlog, [milestone], myApplications] = await Promise.all([
    db
      .select({ user: users, role: memberships.role, skillId: memberships.skillId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.projectId, project.id)),
    db.select().from(roleListings).where(and(eq(roleListings.projectId, project.id), eq(roleListings.status, "open"))),
    db
      .select({ post: posts, author: users })
      .from(posts)
      .leftJoin(users, eq(users.id, posts.authorId))
      .where(role ? eq(posts.projectId, project.id) : and(eq(posts.projectId, project.id), eq(posts.visibility, "public")))
      .orderBy(desc(posts.createdAt))
      .limit(10),
    db.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(desc(milestones.createdAt)).limit(1),
    user
      ? db.select({ listingId: applications.listingId, status: applications.status }).from(applications).where(eq(applications.userId, user.id))
      : Promise.resolve([]),
  ]);
  const appliedTo = new Map(myApplications.map((a) => [a.listingId, a.status]));
  const done = milestone ? milestone.checklist.filter((c) => c.done).length : 0;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {applied && <p className="rounded-md border border-good/40 p-3 text-sm text-good">Application sent. The team will get back to you.</p>}
        {project.pitch && <p className="whitespace-pre-wrap text-lg">{project.pitch}</p>}
        <div className="flex flex-wrap gap-1.5">
          {project.platforms.map((p) => <span key={p} className="chip">{labelFor(PLATFORMS, p)}</span>)}
          {project.genres.map((g) => <span key={g} className="chip">{g}</span>)}
          <span className="chip">{labelFor(ENGAGEMENTS, project.engagement)}</span>
        </div>

        <section>
          <h2 className="h2 mb-3">Open roles</h2>
          {listings.length === 0 && <p className="text-sm text-fg-muted">Not recruiting right now.</p>}
          <ul className="space-y-3">
            {listings.map((l) => (
              <li key={l.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.title}</span>
                  <span className="chip">{skillLabel(l.skillId)}</span>
                  <span className="chip">{labelFor(ENGAGEMENTS, l.engagement)}</span>
                  {l.hoursPerWeek && <span className="chip">{l.hoursPerWeek} h/wk</span>}
                  {l.compensation && <span className="chip">{l.compensation}</span>}
                </div>
                {l.description && <p className="whitespace-pre-wrap text-sm text-fg-muted">{l.description}</p>}
                {role ? null : !user ? (
                  <Link href="/login" className="btn-secondary">Sign in to apply</Link>
                ) : appliedTo.has(l.id) ? (
                  <p className="text-sm text-fg-muted">You applied · {appliedTo.get(l.id)}</p>
                ) : (
                  <form action={applyToListing} className="space-y-2">
                    <input type="hidden" name="listingId" value={l.id} />
                    <textarea name="message" rows={2} placeholder="Why you? Link relevant work." className="input" />
                    <button className="btn">Apply</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="h2 mb-3">Devlog</h2>
          {devlog.length === 0 && <p className="text-sm text-fg-muted">No updates yet.</p>}
          <ul className="space-y-4">
            {devlog.map(({ post, author }) => (
              <li key={post.id} className="card">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{post.title}</h3>
                  {post.visibility === "team" && <span className="chip">team only</span>}
                </div>
                <div className="text-xs text-fg-muted">{author?.name} · {post.createdAt.toLocaleDateString("en-GB")}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        {milestone && (
          <div className="card">
            <div className="text-sm text-fg-muted">Current milestone</div>
            <div className="font-medium">{milestone.title}</div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${milestone.checklist.length ? (done / milestone.checklist.length) * 100 : 0}%` }} />
            </div>
            <div className="mt-1 text-xs text-fg-muted">{done} of {milestone.checklist.length} done</div>
          </div>
        )}
        <div className="card">
          <h2 className="mb-2 font-medium">Team</h2>
          <ul className="space-y-2">
            {team.map((m) => (
              <li key={m.user.id}>
                <Link href={`/people/${m.user.handle}`} className="flex items-center gap-2">
                  <Avatar name={m.user.name} url={m.user.avatarUrl} size={28} />
                  <span className="text-sm">
                    {m.user.name}
                    <span className="block text-xs text-fg-muted">{m.skillId ? skillLabel(m.skillId) : m.role}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {role && <Link href={`/p/${slug}/workspace/general`} className="btn w-full">Open workspace</Link>}
      </aside>
    </div>
  );
}
