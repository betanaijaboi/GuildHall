import { and, count, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { creditConfirmations, credits, endorsements, githubActivity, memberships, portfolioItems, profileSkills, projects, users } from "@/db/schema";
import { toggleEndorsement } from "@/app/actions/rank";
import { addCredit, confirmCredit, deleteCredit } from "@/app/actions/credits";
import { BadgeCheck, Clapperboard, ExternalLink, Users as UsersIcon } from "lucide-react";
import { creditSource, creditStatus } from "@/lib/credits";
import { RankBadge } from "@/components/rank-badge";
import { rankOf, sharesProject } from "@/lib/rank-db";
import { GitMerge, Palette, Pencil } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { DISCIPLINE_STYLE, SkillChip } from "@/components/discipline";
import { GithubIcon } from "@/components/icons";
import { resolveAvatar } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/auth";
import { DISCIPLINES, ENGAGEMENTS, ENGINES, labelFor, PLATFORMS, skillLabel } from "@/lib/taxonomy";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${(await params).handle}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [person] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!person) notFound();
  const viewer = await getCurrentUser();

  const [skills, portfolio, projectRows, merged] = await Promise.all([
    db.select().from(profileSkills).where(eq(profileSkills.userId, person.id)),
    db.select().from(portfolioItems).where(eq(portfolioItems.userId, person.id)),
    db
      .select({ project: projects, role: memberships.role, skillId: memberships.skillId })
      .from(memberships)
      .innerJoin(projects, eq(projects.id, memberships.projectId))
      .where(and(eq(memberships.userId, person.id), eq(projects.visibility, "public"))),
    person.githubLogin
      ? db
          .select({ n: count() })
          .from(githubActivity)
          .where(and(eq(githubActivity.actorLogin, person.githubLogin), eq(githubActivity.kind, "pr_merged")))
      : Promise.resolve([{ n: 0 }]),
  ]);
  const skillIds = new Set(skills.map((s) => s.skillId));
  const [rank, endorsed, canEndorse] = await Promise.all([
    rankOf(db, person.id),
    db.select({ skillId: endorsements.skillId, fromId: endorsements.fromId, fromName: users.name }).from(endorsements).innerJoin(users, eq(users.id, endorsements.fromId)).where(eq(endorsements.toId, person.id)),
    viewer && viewer.id !== person.id ? sharesProject(db, viewer.id, person.id) : Promise.resolve(false),
  ]);
  const endorsedBy = (skillId: string) => endorsed.filter((e) => e.skillId === skillId);
  const creditRows = await db
    .select({ credit: credits, confirmations: sql<number>`(select count(*)::int from ${creditConfirmations} cc where cc.credit_id = ${credits.id})` })
    .from(credits)
    .where(eq(credits.userId, person.id))
    .orderBy(desc(credits.year));
  const viewerTitleKeys = viewer && viewer.id !== person.id
    ? new Set((await db.select({ k: credits.titleKey }).from(credits).where(eq(credits.userId, viewer.id))).map((r) => r.k))
    : new Set<string>();
  const viewerConfirmed = viewer
    ? new Set((await db.select({ id: creditConfirmations.creditId }).from(creditConfirmations).where(eq(creditConfirmations.confirmerId, viewer.id))).map((r) => r.id))
    : new Set<string>();
  const avatar = resolveAvatar(person.avatar, person.handle);
  const mainDiscipline = DISCIPLINES.find((d) => d.specialisations.some((s) => skillIds.has(s.id)));
  const mainStyle = mainDiscipline ? DISCIPLINE_STYLE[mainDiscipline.id] : null;

  return (
    <div className="space-y-6">
      <header className="card overflow-hidden p-0">
        <div className="relative h-28 sm:h-36" style={{ background: `linear-gradient(120deg, ${avatar.bg}, ${avatar.outfit})` }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.18),transparent_50%)]" />
        </div>
        <div className="flex flex-wrap items-end gap-5 px-5 pb-5">
          <div className="-mt-16 animate-pop"><Avatar user={person} size={120} ring /></div>
          <div className="min-w-0 flex-1">
            <h1 className="h1">{person.name}</h1>
            <p className="text-fg-muted">@{person.handle}{person.headline ? ` · ${person.headline}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2"><RankBadge rank={rank.rank} />
            {mainDiscipline && mainStyle && (
              <span className="chip-tint" style={{ "--c": mainStyle.color } as React.CSSProperties}>
                <mainStyle.icon size={12} /> Class: {mainDiscipline.label}
              </span>
            )}
            </div>
          </div>
          {viewer?.id === person.id && (
            <div className="flex gap-2">
              <Link href="/settings/avatar" className="btn-secondary"><Palette size={16} /> Avatar</Link>
              <Link href="/settings/profile" className="btn-secondary"><Pencil size={16} /> Edit profile</Link>
            </div>
          )}
        </div>
      </header>
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        {person.bio && <p className="whitespace-pre-wrap">{person.bio}</p>}

        <section>
          <h2 className="h2 mb-2">Skills</h2>
          {skillIds.size === 0 ? (
            <p className="text-sm text-fg-muted">No skills listed yet.</p>
          ) : (
            <div className="space-y-2">
              {DISCIPLINES.filter((d) => d.specialisations.some((s) => skillIds.has(s.id))).map((d) => (
                <div key={d.id}>
                  <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">{d.label}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.specialisations.filter((s) => skillIds.has(s.id)).map((s) => {
                      const by = endorsedBy(s.id);
                      const mine = by.some((e) => e.fromId === viewer?.id);
                      return (
                        <span key={s.id} className="inline-flex items-center gap-1" title={by.length ? `Endorsed by ${by.map((e) => e.fromName).join(", ")}` : undefined}>
                          <SkillChip skillId={s.id} />
                          {by.length > 0 && <span className="text-xs font-semibold text-good">+{by.length}</span>}
                          {canEndorse && (
                            <form action={toggleEndorsement}>
                              <input type="hidden" name="handle" value={person.handle} />
                              <input type="hidden" name="skillId" value={s.id} />
                              <button className={`rounded-full px-1.5 text-xs transition-colors ${mine ? "bg-good/20 text-good" : "text-fg-muted hover:bg-muted hover:text-fg"}`} title={mine ? "Remove your endorsement" : "Endorse this skill"}>
                                {mine ? "✓" : "+"}
                              </button>
                            </form>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {person.tools.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {person.tools.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
          )}
        </section>

        <section>
          <h2 className="h2 mb-2 flex items-center gap-2"><Clapperboard size={18} className="text-accent" /> Shipped credits</h2>
          {creditRows.length === 0 && <p className="text-sm text-fg-muted">No credits yet.</p>}
          <ul className="space-y-2">
            {creditRows.map(({ credit, confirmations }) => {
              const status = creditStatus(credit.source, confirmations);
              const src = credit.externalUrl ? creditSource(credit.externalUrl) : null;
              return (
                <li key={credit.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{credit.title} <span className="font-normal text-fg-muted">· {credit.role}{credit.year ? ` · ${credit.year}` : ""}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {status === "verified" && <span className="chip-tint" style={{ "--c": "#34d399" } as React.CSSProperties}><BadgeCheck size={12} /> Verified on Guildhall</span>}
                      {status === "confirmed" && <span className="chip-tint" style={{ "--c": "#22d3ee" } as React.CSSProperties}><UsersIcon size={12} /> Confirmed by {confirmations} teammate{confirmations === 1 ? "" : "s"}</span>}
                      {status === "self_reported" && <span className="chip">Self-reported</span>}
                      {src && credit.externalUrl && <a href={credit.externalUrl} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-fg-muted hover:text-accent"><ExternalLink size={12} /> {src}</a>}
                    </div>
                  </div>
                  {credit.source === "self" && viewerTitleKeys.has(credit.titleKey) && !viewerConfirmed.has(credit.id) && (
                    <form action={confirmCredit}>
                      <input type="hidden" name="id" value={credit.id} />
                      <input type="hidden" name="handle" value={person.handle} />
                      <button className="btn-secondary py-1 text-xs"><BadgeCheck size={13} /> I worked on this too, confirm</button>
                    </form>
                  )}
                  {viewer?.id === person.id && credit.source === "self" && (
                    <form action={deleteCredit}><input type="hidden" name="id" value={credit.id} /><button className="text-xs text-fg-muted hover:text-bad">Remove</button></form>
                  )}
                </li>
              );
            })}
          </ul>
          {viewer?.id === person.id && (
            <form action={addCredit} className="card mt-3 grid gap-2 p-3 sm:grid-cols-[1fr_1fr_90px]">
              <input name="title" required placeholder="Game title" className="input" />
              <input name="role" required placeholder="Your role, e.g. Environment Artist" className="input" />
              <input name="year" type="number" min={1970} placeholder="Year" className="input" />
              <input name="externalUrl" placeholder="Steam / IGDB / MobyGames / itch.io link (optional)" className="input sm:col-span-2" />
              <button className="btn-secondary">Add credit</button>
            </form>
          )}
        </section>

        <section>
          <h2 className="h2 mb-2">Portfolio</h2>
          {portfolio.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing here yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {portfolio.map((item) => (
                <li key={item.id} className="card card-hover">
                  <a href={item.url} target="_blank" rel="noreferrer nofollow" className="font-medium link">{item.title}</a>
                  {item.description && <p className="mt-1 text-sm text-fg-muted">{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="h2 mb-2">Projects</h2>
          {projectRows.length === 0 ? (
            <p className="text-sm text-fg-muted">No public projects.</p>
          ) : (
            <ul className="space-y-2">
              {projectRows.map(({ project, role, skillId }) => (
                <li key={project.id}>
                  <Link href={`/p/${project.slug}`} className="link">{project.name}</Link>
                  <span className="text-sm text-fg-muted"> · {role}{skillId ? ` · ${skillLabel(skillId)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-3">
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <RankBadge rank={rank.rank} size="lg" />
            <div>
              <div className="text-xs uppercase tracking-wide text-fg-muted">Guild Rank</div>
              <div className="font-display text-xl font-bold" style={{ color: rank.rank.color }}>{rank.rank.label}</div>
              <div className="text-xs text-fg-muted">{rank.points} points{rank.avgRating ? ` · ★ ${rank.avgRating.toFixed(1)}` : ""}</div>
            </div>
          </div>
          {rank.next && (
            <div>
              <div className="xp-bar"><span style={{ width: `${rank.progress}%` }} /></div>
              <div className="mt-1 text-xs text-fg-muted">{rank.next.min - rank.points} points to {rank.next.label}</div>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-fg-muted">How this rank was earned</summary>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {rank.lines.map((l) => (
                  <tr key={l.label} className="border-t border-border">
                    <td className="py-1.5 pr-2">{l.label}<div className="text-[10px] text-fg-muted">{l.rule}</div></td>
                    <td className="py-1.5 text-right text-fg-muted">{l.count}</td>
                    <td className="py-1.5 pl-2 text-right font-semibold">{l.points > 0 ? `+${l.points}` : l.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-fg-muted">Only verified activity on Guildhall counts. Ranks can&apos;t be bought. {rank.rank.label}s can run {rank.rank.gigSlots} active gigs.</p>
          </details>
        </div>
        <div className="card space-y-2 text-sm">
          <Row label="Availability">{person.availability}</Row>
          {person.seniority && <Row label="Seniority">{person.seniority}</Row>}
          {person.timezone && <Row label="Timezone">{person.timezone}</Row>}
          {person.engines.length > 0 && <Row label="Engines">{person.engines.map((e) => labelFor(ENGINES, e)).join(", ")}</Row>}
          {person.platforms.length > 0 && <Row label="Platforms">{person.platforms.map((p) => labelFor(PLATFORMS, p)).join(", ")}</Row>}
          {person.engagements.length > 0 && <Row label="Open to">{person.engagements.map((e) => labelFor(ENGAGEMENTS, e)).join(", ")}</Row>}
        </div>
        <div className="card text-sm">
          <div className="flex items-center gap-2 font-medium"><GithubIcon size={16} /> GitHub</div>
          {person.githubLogin ? (
            <>
              <a href={`https://github.com/${person.githubLogin}`} className="link" target="_blank" rel="noreferrer">@{person.githubLogin}</a>
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                <GitMerge className="text-accent" size={20} />
                <div>
                  <div className="font-display text-xl font-bold">{merged[0]?.n ?? 0}</div>
                  <div className="text-xs text-fg-muted">merged PRs on Guildhall projects, verified by webhooks</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-fg-muted">Not linked</p>
          )}
        </div>
      </aside>
    </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right capitalize">{children}</span>
    </div>
  );
}
