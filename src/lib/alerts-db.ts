import { and, asc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { jams, memberships, notifications, profileSkills, projects, roleListings, savedSearches, users, type NotificationData } from "@/db/schema";
import { digestDue, digestEmail, isoWeekKey, matchesSearch, roleFit } from "@/lib/alerts";
import { loadHand } from "@/lib/hand-db";
import { jamPhase } from "@/lib/jams";
import type { Mailer } from "@/lib/mailer";
import { ENGAGEMENTS, labelFor, skillLabel } from "@/lib/taxonomy";

export async function notify(
  db: Db,
  userId: string,
  n: { kind: "role_match" | "digest"; title: string; body?: string; url?: string; data?: NotificationData; dedupeKey: string },
): Promise<boolean> {
  const rows = await db.insert(notifications).values({ userId, ...n }).onConflictDoNothing().returning({ id: notifications.id });
  return rows.length > 0;
}

/**
 * A role just opened: alert everyone whose saved search matches, except people already on the
 * project. Private projects never alert outsiders.
 */
export async function alertForListing(db: Db, listingId: string): Promise<number> {
  const [row] = await db.select({ l: roleListings, p: projects }).from(roleListings).innerJoin(projects, eq(projects.id, roleListings.projectId)).where(eq(roleListings.id, listingId)).limit(1);
  if (!row || row.p.visibility !== "public" || row.l.status !== "open") return 0;
  const role = { skillId: row.l.skillId, engine: row.p.engine, stage: row.p.stage };
  const candidates = await db
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.alerts, true), or(isNull(savedSearches.skill), eq(savedSearches.skill, role.skillId)), or(isNull(savedSearches.engine), eq(savedSearches.engine, role.engine))));
  const team = new Set((await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.projectId, row.p.id))).map((m) => m.id));
  let sent = 0;
  const seen = new Set<string>();
  for (const s of candidates) {
    if (team.has(s.userId) || seen.has(s.userId) || !matchesSearch(s, role)) continue;
    seen.add(s.userId);
    const ok = await notify(db, s.userId, {
      kind: "role_match",
      title: `New role: ${row.l.title} on ${row.p.name}`,
      body: `Matches your alert "${s.name}". ${row.l.compensation || labelFor(ENGAGEMENTS, row.l.engagement)}${row.l.hoursPerWeek ? ` · ${row.l.hoursPerWeek}h/week` : ""}`,
      url: `/p/${row.p.slug}`,
      dedupeKey: `role:${row.l.id}`,
    });
    if (ok) sent++;
  }
  return sent;
}

type Section = { heading: string; lines: { text: string; url: string }[] };

/** What goes in someone's digest for the week since `since`. Empty sections are dropped. */
export async function buildDigest(db: Db, user: typeof users.$inferSelect, since: Date, now: Date): Promise<Section[]> {
  const [skills, searches, mine] = await Promise.all([
    db.select({ id: profileSkills.skillId }).from(profileSkills).where(eq(profileSkills.userId, user.id)),
    db.select().from(savedSearches).where(eq(savedSearches.userId, user.id)),
    db.select({ id: memberships.projectId }).from(memberships).where(eq(memberships.userId, user.id)),
  ]);
  const person = { skills: skills.map((s) => s.id), engines: user.engines };
  const myProjects = new Set(mine.map((m) => m.id));

  const fresh = await db
    .select({ l: roleListings, p: projects })
    .from(roleListings)
    .innerJoin(projects, eq(projects.id, roleListings.projectId))
    .where(and(eq(roleListings.status, "open"), eq(projects.visibility, "public"), gte(roleListings.createdAt, since)))
    .orderBy(asc(roleListings.createdAt))
    .limit(300);
  const roles = fresh
    .filter(({ p }) => !myProjects.has(p.id))
    .map(({ l, p }) => {
      const r = { skillId: l.skillId, engine: p.engine, stage: p.stage };
      const saved = searches.some((s) => matchesSearch(s, r));
      return { l, p, score: roleFit(person, r) + (saved ? 3 : 0) };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const upcomingJams = await db
    .select()
    .from(jams)
    .where(and(gt(jams.endsAt, now), lt(jams.startsAt, new Date(now.getTime() + 14 * 86_400_000))))
    .orderBy(asc(jams.startsAt))
    .limit(3);

  const hand = await loadHand(db, user);
  const blocking = hand.filter((h) => !h.locked).length;

  const sections: Section[] = [
    { heading: "Roles for you", lines: roles.map(({ l, p }) => ({ text: `${l.title} (${skillLabel(l.skillId)}) on ${p.name}`, url: `/p/${p.slug}` })) },
    { heading: "Jams", lines: upcomingJams.map((j) => ({ text: `${j.name}: ${jamPhase(j, now) === "running" ? "live now" : `starts ${j.startsAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`}`, url: `/jams/${j.slug}` })) },
    { heading: "Waiting on you", lines: blocking ? [{ text: `${blocking} item${blocking === 1 ? "" : "s"} in your hand`, url: "/hand" }] : [] },
  ];
  return sections.filter((s) => s.lines.length);
}

/**
 * Hourly: send digests to people whose last one is a week old (at most `batch` per run). Each
 * person is claimed with a conditional update first, so overlapping runs never double-send.
 */
export async function runWeeklyDigests(db: Db, now: Date, mailer: Mailer, appUrl: string, batch = 200): Promise<{ sent: number; emailed: number }> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000 + 3_600_000);
  const due = await db
    .select()
    .from(users)
    .where(or(isNull(users.lastDigestAt), lt(users.lastDigestAt, cutoff)))
    .orderBy(sql`${users.lastDigestAt} asc nulls first`)
    .limit(batch);
  let sent = 0;
  let emailed = 0;
  for (const u of due) {
    if (!digestDue(u.lastDigestAt, now)) continue;
    const claimed = await db
      .update(users)
      .set({ lastDigestAt: now })
      .where(and(eq(users.id, u.id), u.lastDigestAt ? eq(users.lastDigestAt, u.lastDigestAt) : isNull(users.lastDigestAt)))
      .returning({ id: users.id });
    if (!claimed.length) continue;
    const sections = await buildDigest(db, u, u.lastDigestAt ?? new Date(now.getTime() - 7 * 86_400_000), now);
    if (!sections.length) continue;
    const lines = sections.flatMap((s) => [`## ${s.heading}`, ...s.lines.map((l) => `${l.text}|${l.url}`)]);
    const fresh = await notify(db, u.id, {
      kind: "digest",
      title: "Your week on Guildhall",
      body: sections.map((s) => `${s.lines.length} ${s.heading.toLowerCase()}`).join(" · "),
      url: "/notifications",
      data: { lines },
      dedupeKey: `digest:${isoWeekKey(now)}`,
    });
    if (!fresh) continue;
    sent++;
    if (u.emailDigest && u.email) {
      const mail = digestEmail(u.name, sections, appUrl);
      if (await mailer({ to: u.email, ...mail }).catch(() => false)) emailed++;
    }
  }
  return { sent, emailed };
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r.n;
}

export async function markAllRead(db: Db, userId: string, ids?: string[]): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ...(ids?.length ? [inArray(notifications.id, ids)] : [])));
}
