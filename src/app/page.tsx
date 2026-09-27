import { and, count, desc, eq } from "drizzle-orm";
import { ArrowRight, GitMerge, MessagesSquare, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { projects, roleListings, users } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { DISCIPLINE_STYLE, SkillChip } from "@/components/discipline";
import { LogoMark } from "@/components/logo";
import { ProjectCrest } from "@/components/project-cover";
import { DISCIPLINES, ENGAGEMENTS, ENGINES, labelFor } from "@/lib/taxonomy";

const ORBIT = ["narrative", "art", "engineering", "audio", "design", "production"];

export default async function Home() {
  const [openRoles, party, [peopleCount], [projectCount], [roleCount]] = await Promise.all([
    db
      .select({ listing: roleListings, project: projects })
      .from(roleListings)
      .innerJoin(projects, eq(projects.id, roleListings.projectId))
      .where(and(eq(roleListings.status, "open"), eq(projects.visibility, "public")))
      .orderBy(desc(roleListings.createdAt))
      .limit(6),
    db.select().from(users).orderBy(desc(users.createdAt)).limit(5),
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(projects).where(eq(projects.visibility, "public")),
    db.select({ n: count() }).from(roleListings).where(eq(roleListings.status, "open")),
  ]);

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 pt-4 md:grid-cols-[1.1fr_1fr] md:pt-10">
        <div className="stagger space-y-5">
          <span className="chip-tint w-fit" style={{ "--c": "#a78bfa" } as React.CSSProperties}>
            <Sparkles size={12} /> For every discipline that makes a game
          </span>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Find your party.
            <br />
            <span className="text-gradient">Build your game.</span>
          </h1>
          <p className="max-w-xl text-lg text-fg-muted">
            Narrative directors, world builders, engine wizards and composers meet here, form teams, and ship, with the chat,
            the tasks and the commits living in one guildhall wired to GitHub.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects" className="btn px-5 py-2.5 text-base">Browse projects <ArrowRight size={18} /></Link>
            <Link href="/people" className="btn-secondary px-5 py-2.5 text-base">Find people</Link>
          </div>
          <div className="flex items-center gap-4 pt-2">
            <div className="flex -space-x-3">
              {party.map((u) => (
                <span key={u.id} className="rounded-full ring-4 ring-bg"><Avatar user={u} size={40} /></span>
              ))}
            </div>
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">{peopleCount.n}</span> makers · <span className="font-semibold text-fg">{projectCount.n}</span> projects ·{" "}
              <span className="font-semibold text-fg">{roleCount.n}</span> open roles
            </p>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[260px] sm:max-w-sm" aria-hidden>
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-violet-600/30 to-cyan-500/20 blur-3xl" />
          <div className="absolute inset-0 rounded-full border border-dashed border-border animate-spin-slow" />
          <div className="absolute inset-12 rounded-full border border-border/60" />
          <div className="logo-hero absolute inset-0 flex items-center justify-center animate-float-slow">
            <LogoMark size={150} />
          </div>
          {ORBIT.map((id, i) => {
            const { color, icon: Icon } = DISCIPLINE_STYLE[id];
            const angle = (i / ORBIT.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <span
                key={id}
                className="absolute flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface shadow-xl"
                style={{
                  left: `calc(50% + ${Math.cos(angle) * 44}% - 28px)`,
                  top: `calc(50% + ${Math.sin(angle) * 44}% - 28px)`,
                  color,
                  animation: `float ${5 + i}s ease-in-out ${-i}s infinite`,
                  boxShadow: `0 12px 30px -12px ${color}`,
                }}
              >
                <Icon size={24} />
              </span>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">Every class in the guild</h2>
          <Link href="/people" className="link text-sm">All people →</Link>
        </div>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {DISCIPLINES.map((d) => {
            const { color, icon: Icon } = DISCIPLINE_STYLE[d.id];
            return (
              <Link key={d.id} href={`/people?discipline=${d.id}`} className="card card-hover group flex flex-col gap-3 p-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110 group-hover:-rotate-6" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
                  <Icon size={22} />
                </span>
                <span className="text-sm font-semibold leading-tight">{d.label}</span>
                <span className="text-xs text-fg-muted">{d.specialisations.length} specialisations</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Sparkles, title: "Find", body: "Profiles built on a real game-dev skill tree. Filter by engine, platform and engagement, and see who fills your team's gaps." },
          { icon: MessagesSquare, title: "Build", body: "Channels and threads per project. PRs, issues, CI and builds flow in from GitHub as live cards." },
          { icon: Trophy, title: "Show", body: "A quest log for each pipeline stage, devlogs, and a weekly digest written from real activity." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="card card-hover">
            <Icon className="text-accent" size={22} />
            <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">Recruiting now</h2>
          <Link href="/projects" className="link text-sm">All projects →</Link>
        </div>
        {openRoles.length === 0 ? (
          <p className="text-sm text-fg-muted">No open roles yet. <Link href="/projects/new" className="link">Start a project</Link>.</p>
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {openRoles.map(({ listing, project }) => (
              <li key={listing.id}>
                <Link href={`/p/${project.slug}`} className="card card-hover flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <ProjectCrest slug={project.slug} name={project.name} size={40} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{listing.title}</div>
                      <div className="truncate text-sm text-fg-muted">{project.name}</div>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <SkillChip skillId={listing.skillId} />
                    <span className="chip">{labelFor(ENGINES, project.engine)}</span>
                    <span className="chip">{labelFor(ENGAGEMENTS, listing.engagement)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card relative overflow-hidden text-center">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-transparent to-cyan-500/20" />
        <div className="relative space-y-3 py-6">
          <GitMerge className="mx-auto text-accent" size={28} />
          <h2 className="font-display text-2xl font-bold">Your repo is the source of truth.</h2>
          <p className="mx-auto max-w-xl text-fg-muted">Link a GitHub repo and Guildhall does the rest: LFS-ready setup PRs, issue-synced tasks, and repo access that follows team membership.</p>
          <Link href="/projects/new" className="btn mt-2">Start a project</Link>
        </div>
      </section>
    </div>
  );
}
