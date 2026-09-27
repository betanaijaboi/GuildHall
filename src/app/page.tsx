import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { projects, roleListings } from "@/db/schema";
import { labelFor, ENGINES, ENGAGEMENTS, skillLabel } from "@/lib/taxonomy";

export default async function Home() {
  const openRoles = await db
    .select({ listing: roleListings, project: projects })
    .from(roleListings)
    .innerJoin(projects, eq(projects.id, roleListings.projectId))
    .where(and(eq(roleListings.status, "open"), eq(projects.visibility, "public")))
    .orderBy(desc(roleListings.createdAt))
    .limit(8);

  return (
    <div className="space-y-10">
      <section className="py-8">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">
          Find game makers. Build together. Ship, with GitHub in the loop.
        </h1>
        <p className="mt-3 max-w-2xl text-fg-muted">
          Narrative directors, environment artists, engine programmers, composers, producers — every discipline a game
          needs, with a team workspace where the chat, the tasks and the commits share one project.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/projects" className="btn">Browse projects</Link>
          <Link href="/people" className="btn-secondary">Find people</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Find", "Profiles built on a game-dev skill taxonomy, filterable by engine, platform and engagement."],
          ["Build", "Channels, threads and tasks per project. PRs, issues, CI and releases flow in from GitHub."],
          ["Show", "Milestones by pipeline stage, devlogs and a weekly digest generated from real activity."],
        ].map(([title, body]) => (
          <div key={title} className="card">
            <h2 className="h2">{title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="h2 mb-3">Recruiting now</h2>
        {openRoles.length === 0 ? (
          <p className="text-sm text-fg-muted">No open roles yet. <Link href="/projects/new" className="link">Start a project</Link>.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {openRoles.map(({ listing, project }) => (
              <li key={listing.id} className="card">
                <Link href={`/p/${project.slug}`} className="font-medium link">{listing.title}</Link>
                <div className="text-sm text-fg-muted">{project.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip">{skillLabel(listing.skillId)}</span>
                  <span className="chip">{labelFor(ENGINES, project.engine)}</span>
                  <span className="chip">{labelFor(ENGAGEMENTS, listing.engagement)}</span>
                  {listing.hoursPerWeek && <span className="chip">{listing.hoursPerWeek} h/wk</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
