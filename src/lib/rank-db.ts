import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { assetReviews, assetVersions, creditConfirmations, credits, endorsements, engagementMilestones, engagementReviews, engagements, githubActivity, memberships, tasks, users } from "@/db/schema";
import { computeRank, EMPTY_INPUTS, type RankInputs } from "./rank";

/** Rank inputs for many users at once (one query per signal, not per user). */
export async function loadRankInputs(db: Db, userIds: string[]): Promise<Map<string, RankInputs>> {
  const map = new Map<string, RankInputs>(userIds.map((id) => [id, { ...EMPTY_INPUTS, reviewRatings: [] }]));
  if (!userIds.length) return map;
  const people = await db.select({ id: users.id, login: users.githubLogin }).from(users).where(inArray(users.id, userIds));
  const byLogin = new Map(people.filter((p) => p.login).map((p) => [p.login!, p.id]));

  const [prs, approved, paid, stages, endorse, reviews, creds] = await Promise.all([
    byLogin.size
      ? db.select({ login: githubActivity.actorLogin, n: sql<number>`count(*)::int` }).from(githubActivity)
          .where(and(eq(githubActivity.kind, "pr_merged"), inArray(githubActivity.actorLogin, [...byLogin.keys()]))).groupBy(githubActivity.actorLogin)
      : Promise.resolve([]),
    // Distinct assets whose approved version this person uploaded.
    db.select({ id: assetVersions.uploadedBy, n: sql<number>`count(distinct ${assetVersions.assetId})::int` }).from(assetReviews)
      .innerJoin(assetVersions, eq(assetVersions.id, assetReviews.versionId))
      .where(and(eq(assetReviews.decision, "approved"), inArray(assetVersions.uploadedBy, userIds))).groupBy(assetVersions.uploadedBy),
    db.select({ id: engagements.makerId, n: sql<number>`count(*)::int` }).from(engagementMilestones)
      .innerJoin(engagements, eq(engagements.id, engagementMilestones.engagementId))
      .where(and(eq(engagementMilestones.status, "released"), inArray(engagements.makerId, userIds))).groupBy(engagements.makerId),
    db.select({ id: tasks.assigneeId, n: sql<number>`count(*)::int` }).from(tasks)
      .where(and(isNotNull(tasks.pipelineItemId), eq(tasks.status, "done"), inArray(tasks.assigneeId, userIds))).groupBy(tasks.assigneeId),
    db.select({ id: endorsements.toId, n: sql<number>`count(*)::int` }).from(endorsements).where(inArray(endorsements.toId, userIds)).groupBy(endorsements.toId),
    db.select({ id: engagementReviews.toId, rating: engagementReviews.rating }).from(engagementReviews).where(inArray(engagementReviews.toId, userIds)),
    // Guildhall-verified credits, or self-reported ones a teammate confirmed.
    db.select({ id: credits.userId, n: sql<number>`count(*)::int` }).from(credits)
      .where(and(inArray(credits.userId, userIds), sql`(${credits.source} = 'guildhall' or exists (select 1 from ${creditConfirmations} cc where cc.credit_id = ${credits.id}))`))
      .groupBy(credits.userId),
  ]);
  for (const r of prs) { const id = byLogin.get(r.login!); if (id) map.get(id)!.mergedPrs = r.n; }
  for (const r of approved) if (r.id) map.get(r.id)!.approvedAssets = r.n;
  for (const r of paid) map.get(r.id)!.paidMilestones = r.n;
  for (const r of stages) if (r.id) map.get(r.id)!.pipelineStages = r.n;
  for (const r of endorse) map.get(r.id)!.endorsements = r.n;
  for (const r of reviews) map.get(r.id)!.reviewRatings.push(r.rating);
  for (const r of creds) map.get(r.id)!.credits = r.n;
  return map;
}

export async function rankOf(db: Db, userId: string) {
  return computeRank((await loadRankInputs(db, [userId])).get(userId)!);
}

/** Endorsing requires having shared at least one project. */
export async function sharesProject(db: Db, a: string, b: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1 from ${memberships} m1 join ${memberships} m2 on m1.project_id = m2.project_id
    where m1.user_id = ${a} and m2.user_id = ${b} limit 1`);
  return rows.length > 0;
}
