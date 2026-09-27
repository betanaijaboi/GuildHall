import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { applications, memberships, profileSkills, roleListings, users } from "@/db/schema";
import { closeListing, createListing, decideApplication, leaveOrRemoveMember } from "@/app/actions/project";
import { Avatar } from "@/components/avatar";
import { SkillChip } from "@/components/discipline";
import { SkillSelect } from "@/components/skill-picker";
import { RateHint } from "@/components/rate-hint";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { rankCandidates, teamGaps } from "@/lib/gap-analysis";
import { ENGAGEMENTS, labelFor, skillLabel, STAGES } from "@/lib/taxonomy";

export const metadata = { title: "Team & roles" };

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const isLead = roleAtLeast(role, "lead");

  const [team, listings] = await Promise.all([
    db.select({ user: users, role: memberships.role, skillId: memberships.skillId }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.projectId, project.id)),
    db.select().from(roleListings).where(eq(roleListings.projectId, project.id)).orderBy(desc(roleListings.createdAt)),
  ]);
  const memberIds = team.map((m) => m.user.id);
  const teamSkills = await db.select().from(profileSkills).where(inArray(profileSkills.userId, memberIds));
  const openListings = listings.filter((l) => l.status === "open");

  const gaps = teamGaps(
    project.stage,
    team.map((m) => ({
      userId: m.user.id,
      skillIds: [...(m.skillId ? [m.skillId] : []), ...teamSkills.filter((s) => s.userId === m.user.id).map((s) => s.skillId)],
    })),
    openListings.map((l) => l.skillId),
  );

  // Suggest people for the uncovered skills (missing or recruiting), excluding current members.
  const wanted = [...gaps.missing, ...gaps.recruiting];
  let suggestions: { user: typeof users.$inferSelect; skillIds: string[] }[] = [];
  if (wanted.length) {
    const skilled = await db
      .select({ user: users, skillId: profileSkills.skillId })
      .from(profileSkills)
      .innerJoin(users, eq(users.id, profileSkills.userId))
      .where(and(inArray(profileSkills.skillId, wanted), notInArray(users.id, memberIds)));
    const byUser = new Map<string, { user: typeof users.$inferSelect; skillIds: string[] }>();
    for (const row of skilled) {
      const entry = byUser.get(row.user.id) ?? { user: row.user, skillIds: [] };
      entry.skillIds.push(row.skillId);
      byUser.set(row.user.id, entry);
    }
    const ranked = rankCandidates(
      wanted,
      project.engine,
      [...byUser.values()].map((e) => ({ userId: e.user.id, skillIds: e.skillIds, engines: e.user.engines, availability: e.user.availability })),
    );
    suggestions = ranked.slice(0, 6).map((c) => byUser.get(c.userId)!);
  }

  const pending = isLead && listings.length
    ? await db
        .select({ application: applications, applicant: users, listing: roleListings })
        .from(applications)
        .innerJoin(users, eq(users.id, applications.userId))
        .innerJoin(roleListings, eq(roleListings.id, applications.listingId))
        .where(and(inArray(applications.listingId, listings.map((l) => l.id)), eq(applications.status, "pending")))
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="card space-y-3">
          <h2 className="h2">Party composition for {labelFor(STAGES, project.stage)}</h2>
          <p className="text-sm text-fg-muted">Specialisations a team usually needs at this stage, compared with your members&apos; roles and profile skills.</p>
          <div className="flex flex-wrap gap-1.5">
            {gaps.covered.map((s) => <SkillChip key={s} skillId={s} prefix="✓ " />)}
            {gaps.recruiting.map((s) => <span key={s} className="chip border-dashed text-warn">recruiting · {skillLabel(s)}</span>)}
            {gaps.missing.map((s) => <span key={s} className="chip border-dashed border-bad/50 text-bad">missing · {skillLabel(s)}</span>)}
          </div>
          {suggestions.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">People who could fill them</div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <li key={s.user.id}>
                    <Link href={`/people/${s.user.handle}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted">
                      <Avatar user={s.user} size={34} />
                      <span className="text-sm">
                        {s.user.name}
                        <span className="block text-xs text-fg-muted">{s.skillIds.map(skillLabel).join(", ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {isLead && pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="h2">Applications</h2>
            {pending.map(({ application, applicant, listing }) => (
              <div key={application.id} className="card space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar user={applicant} size={34} />
                  <Link href={`/people/${applicant.handle}`} className="font-medium link">{applicant.name}</Link>
                  <span className="text-sm text-fg-muted">for {listing.title}</span>
                </div>
                {application.message && <p className="whitespace-pre-wrap text-sm">{application.message}</p>}
                <form action={decideApplication.bind(null, slug)} className="flex gap-2">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <button name="decision" value="accept" className="btn">Accept</button>
                  <button name="decision" value="decline" className="btn-secondary">Decline</button>
                </form>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="h2">Role listings</h2>
          {listings.length === 0 && <p className="text-sm text-fg-muted">No listings yet.</p>}
          <ul className="space-y-2">
            {listings.map((l) => (
              <li key={l.id} className="card flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.title}</span>
                <span className="chip">{labelFor(ENGAGEMENTS, l.engagement)}</span>
                <span className={`chip ${l.status === "open" ? "text-good" : ""}`}>{l.status}</span>
                {isLead && l.status === "open" && (
                  <form action={closeListing.bind(null, slug)} className="ml-auto">
                    <input type="hidden" name="id" value={l.id} />
                    <button className="text-sm text-fg-muted hover:text-bad">Close</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {isLead && (
            <form action={createListing.bind(null, slug)} className="card grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 font-medium">Post a role</div>
              <SkillSelect name="skillId" defaultValue={gaps.missing[0]} required />
              <input name="title" placeholder="Title (defaults to the specialisation)" className="input" />
              <select name="engagement" defaultValue={project.engagement} className="input">
                {ENGAGEMENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              <div className="flex gap-2">
                <input name="hoursPerWeek" type="number" min={1} max={80} placeholder="h/week" className="input" />
                <input name="compensation" placeholder="e.g. 10% rev-share, $40/h" className="input" />
              </div>
              <textarea name="description" rows={3} placeholder="What they'll do, what you need to see" className="input sm:col-span-2" />
              <div className="sm:col-span-2"><RateHint selectName="skillId" /></div>
              <button className="btn sm:col-span-2">Post role</button>
            </form>
          )}
        </section>
      </div>

      <aside className="card h-fit">
        <h2 className="mb-2 font-medium">Team ({team.length})</h2>
        <ul className="space-y-2">
          {team.map((m) => (
            <li key={m.user.id} className="flex items-center gap-2">
              <Avatar user={m.user} size={34} />
              <span className="text-sm">
                <Link href={`/people/${m.user.handle}`} className="hover:underline">{m.user.name}</Link>
                <span className="block text-xs text-fg-muted">{m.role}{m.skillId ? ` · ${skillLabel(m.skillId)}` : ""}</span>
              </span>
              {m.role !== "owner" && (isLead || m.user.id === user.id) && (
                <form action={leaveOrRemoveMember.bind(null, slug)} className="ml-auto">
                  <input type="hidden" name="userId" value={m.user.id} />
                  <button className="text-xs text-fg-muted hover:text-bad">{m.user.id === user.id ? "Leave" : "Remove"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
