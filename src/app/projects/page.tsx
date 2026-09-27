import { and, desc, eq, exists, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { memberships, projects, roleListings } from "@/db/schema";
import { SkillSelect } from "@/components/skill-picker";
import { getCurrentUser } from "@/lib/auth";
import { ENGINES, labelFor, STAGES } from "@/lib/taxonomy";

export const metadata = { title: "Projects" };

type Search = { engine?: string; skill?: string; stage?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams;
  const user = await getCurrentUser();

  const mine = user
    ? await db
        .select({ project: projects, role: memberships.role })
        .from(memberships)
        .innerJoin(projects, eq(projects.id, memberships.projectId))
        .where(eq(memberships.userId, user.id))
        .orderBy(desc(projects.createdAt))
    : [];

  const where: SQL[] = [eq(projects.visibility, "public")];
  if (f.engine) where.push(eq(projects.engine, f.engine));
  if (f.stage) where.push(sql`${projects.stage}::text = ${f.stage}`);
  if (f.skill) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(roleListings)
          .where(and(eq(roleListings.projectId, projects.id), eq(roleListings.status, "open"), eq(roleListings.skillId, f.skill))),
      ),
    );
  }
  const browse = await db
    .select({
      project: projects,
      openRoles: sql<number>`(select count(*)::int from ${roleListings} where ${roleListings.projectId} = ${projects.id} and ${roleListings.status} = 'open')`,
    })
    .from(projects)
    .where(and(...where))
    .orderBy(desc(projects.createdAt))
    .limit(60);

  return (
    <div className="space-y-8">
      {mine.length > 0 && (
        <section>
          <h1 className="h1 mb-3">Your projects</h1>
          <ul className="grid gap-3 sm:grid-cols-3">
            {mine.map(({ project, role }) => (
              <li key={project.id}>
                <Link href={`/p/${project.slug}/workspace/general`} className="card block hover:border-accent">
                  <div className="font-medium">{project.name}</div>
                  <div className="text-sm text-fg-muted">{labelFor(STAGES, project.stage)} · {role}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h2 className={mine.length ? "h2" : "h1"}>Browse projects</h2>
          <form className="ml-auto flex flex-wrap gap-2" method="get">
            <select name="engine" defaultValue={f.engine ?? ""} className="input w-auto">
              <option value="">Any engine</option>
              {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            <select name="stage" defaultValue={f.stage ?? ""} className="input w-auto">
              <option value="">Any stage</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <div className="w-56"><SkillSelect name="skill" defaultValue={f.skill} /></div>
            <button className="btn-secondary">Filter</button>
          </form>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {browse.map(({ project, openRoles }) => (
            <li key={project.id} className="card">
              <Link href={`/p/${project.slug}`} className="font-medium link">{project.name}</Link>
              <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{project.pitch}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="chip">{labelFor(ENGINES, project.engine)}</span>
                <span className="chip">{labelFor(STAGES, project.stage)}</span>
                {openRoles > 0 && <span className="chip text-good">{openRoles} open role{openRoles === 1 ? "" : "s"}</span>}
              </div>
            </li>
          ))}
        </ul>
        {browse.length === 0 && <p className="text-sm text-fg-muted">No matching projects.</p>}
      </section>
    </div>
  );
}
