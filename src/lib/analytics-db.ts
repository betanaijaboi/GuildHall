import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { applications, feedbackReports, playtests, playtestTesters, portfolioClicks, portfolioItems, roadmapItems, roadmapVotes, roleListings, viewHits } from "@/db/schema";
import { dayKey, RETENTION_DAYS, series } from "@/lib/analytics";

type Subject = { subjectType: "profile" | "project"; subjectId: string };

/** Count a view: the first view of the day sets the visitor's source; repeats only add to `views`. */
export async function recordView(db: Db, s: Subject & { visitorHash: string; source: string; day: string }): Promise<void> {
  await db
    .insert(viewHits)
    .values({ subjectType: s.subjectType, subjectId: s.subjectId, day: s.day, visitorHash: s.visitorHash, source: s.source })
    .onConflictDoUpdate({ target: [viewHits.subjectType, viewHits.subjectId, viewHits.day, viewHits.visitorHash], set: { views: sql`least(${viewHits.views} + 1, 1000)` } });
}

export async function recordClick(db: Db, portfolioItemId: string, day: string, visitorHash: string): Promise<void> {
  await db.insert(portfolioClicks).values({ portfolioItemId, day, visitorHash }).onConflictDoNothing();
}

async function viewStats(db: Db, s: Subject, days: number, now: Date) {
  const since = dayKey(new Date(now.getTime() - (days - 1) * 86_400_000));
  const where = and(eq(viewHits.subjectType, s.subjectType), eq(viewHits.subjectId, s.subjectId), gte(viewHits.day, since));
  const [daily, sources] = await Promise.all([
    db.select({ day: viewHits.day, uniques: count(), views: sql<number>`sum(${viewHits.views})::int` }).from(viewHits).where(where).groupBy(viewHits.day),
    db.select({ source: viewHits.source, n: count() }).from(viewHits).where(where).groupBy(viewHits.source).orderBy(desc(count())).limit(8),
  ]);
  return {
    uniques: series(daily.map((d) => ({ day: d.day, value: d.uniques })), days, now),
    views: series(daily.map((d) => ({ day: d.day, value: d.views })), days, now),
    sources,
  };
}

export async function profileStats(db: Db, userId: string, days = 30, now = new Date()) {
  const since = dayKey(new Date(now.getTime() - (days - 1) * 86_400_000));
  const [views, clicks] = await Promise.all([
    viewStats(db, { subjectType: "profile", subjectId: userId }, days, now),
    db
      .select({ id: portfolioItems.id, title: portfolioItems.title, n: sql<number>`count(${portfolioClicks.visitorHash})::int` })
      .from(portfolioItems)
      .leftJoin(portfolioClicks, and(eq(portfolioClicks.portfolioItemId, portfolioItems.id), gte(portfolioClicks.day, since)))
      .where(eq(portfolioItems.userId, userId))
      .groupBy(portfolioItems.id, portfolioItems.title)
      .orderBy(desc(sql`count(${portfolioClicks.visitorHash})`)),
  ]);
  return { ...views, clicks };
}

export async function projectStats(db: Db, projectId: string, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [views, votes, signups, feedback, roles] = await Promise.all([
    viewStats(db, { subjectType: "project", subjectId: projectId }, days, now),
    db.select({ n: count() }).from(roadmapVotes).innerJoin(roadmapItems, eq(roadmapItems.id, roadmapVotes.itemId)).where(and(eq(roadmapItems.projectId, projectId), gte(roadmapVotes.createdAt, since))),
    db.select({ n: count() }).from(playtestTesters).innerJoin(playtests, eq(playtests.id, playtestTesters.playtestId)).where(and(eq(playtests.projectId, projectId), gte(playtestTesters.joinedAt, since))),
    db.select({ kind: feedbackReports.kind, n: count() }).from(feedbackReports).where(and(eq(feedbackReports.projectId, projectId), gte(feedbackReports.createdAt, since))).groupBy(feedbackReports.kind),
    db
      .select({ id: roleListings.id, title: roleListings.title, n: sql<number>`count(${applications.id})::int` })
      .from(roleListings)
      .leftJoin(applications, and(eq(applications.listingId, roleListings.id), gte(applications.createdAt, since)))
      .where(and(eq(roleListings.projectId, projectId), eq(roleListings.status, "open")))
      .groupBy(roleListings.id, roleListings.title),
  ]);
  return {
    ...views,
    roadmapVotes: votes[0]?.n ?? 0,
    playtestSignups: signups[0]?.n ?? 0,
    feedback: Object.fromEntries(feedback.map((f) => [f.kind, f.n])) as Partial<Record<"bug" | "feedback" | "idea", number>>,
    roles,
  };
}

/** Hourly: drop analytics older than the retention window. */
export async function pruneAnalytics(db: Db, now: Date): Promise<void> {
  const cutoff = dayKey(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
  await db.delete(viewHits).where(lt(viewHits.day, cutoff));
  await db.delete(portfolioClicks).where(lt(portfolioClicks.day, cutoff));
}

