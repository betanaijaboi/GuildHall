import { and, desc, eq, exists, sql, type SQL } from "drizzle-orm";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { saveRoleSearch } from "@/app/actions/alerts";
import { db } from "@/db";
import { memberships, projects, roleListings } from "@/db/schema";
import { ProjectCover, ProjectCrest } from "@/components/project-cover";
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
      openRoles: sql<number>`(select count(*)::int from ${roleListings} where "role_listings"."project_id" = "projects"."id" and "role_listings"."status" = 'open')`,
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
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map(({ project, role }) => (
              <li key={project.id}>
                <Link href={`/p/${project.slug}/workspace`} className="card card-hover flex items-center gap-3">
                  <ProjectCrest slug={project.slug} name={project.name} size={44} />
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold">{project.name}</div>
                    <div className="text-sm text-fg-muted">{labelFor(STAGES, project.stage)} · {role}</div>
                  </div>
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
          {user && (f.skill || f.engine || f.stage) && (
            <form action={saveRoleSearch}>
              <input type="hidden" name="skill" value={f.skill ?? ""} />
              <input type="hidden" name="engine" value={f.engine ?? ""} />
              <input type="hidden" name="stage" value={f.stage ?? ""} />
              <button className="btn-secondary" title="Get notified when a matching role opens"><BellRing size={15} /> Alert me</button>
            </form>
          )}
        </div>
        <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {browse.map(({ project, openRoles }) => (
            <li key={project.id}>
              <Link href={`/p/${project.slug}`} className="card card-hover group flex h-full flex-col overflow-hidden p-0">
                <ProjectCover slug={project.slug} className="h-24" />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="-mt-10 mb-1"><ProjectCrest slug={project.slug} name={project.name} size={48} /></div>
                  <div className="font-display text-lg font-semibold group-hover:text-accent">{project.name}</div>
                  <p className="line-clamp-2 text-sm text-fg-muted">{project.pitch}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <span className="chip">{labelFor(ENGINES, project.engine)}</span>
                    <span className="chip">{labelFor(STAGES, project.stage)}</span>
                    {openRoles > 0 && <span className="chip-tint" style={{ "--c": "#34d399" } as React.CSSProperties}>{openRoles} open role{openRoles === 1 ? "" : "s"}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {browse.length === 0 && <p className="text-sm text-fg-muted">No matching projects.</p>}
      </section>
    </div>
  );
}
