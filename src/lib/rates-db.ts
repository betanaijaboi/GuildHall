import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { gigs, gigTiers, rateReports } from "@/db/schema";
import { summariseRates, type RateSummary } from "./rates";

export async function rateSummary(db: Db, skillId: string, f: { seniority?: string; region?: string } = {}): Promise<RateSummary> {
  const where: SQL[] = [eq(rateReports.skillId, skillId)];
  if (f.seniority) where.push(sql`${rateReports.seniority}::text = ${f.seniority}`);
  if (f.region) where.push(eq(rateReports.region, f.region));
  const rows = await db.select({ v: rateReports.hourlyUsdCents }).from(rateReports).where(and(...where));
  return summariseRates(rows.map((r) => r.v));
}

/** Public gig prices for a skill (already public, so no threshold), USD gigs only. */
export async function gigPriceSummary(db: Db, skillId: string): Promise<{ n: number; medianBasic: number | null }> {
  const rows = await db
    .select({ price: gigTiers.priceCents })
    .from(gigTiers)
    .innerJoin(gigs, eq(gigs.id, gigTiers.gigId))
    .where(and(eq(gigs.skillId, skillId), eq(gigs.status, "active"), eq(gigs.currency, "usd"), eq(gigTiers.tier, "basic")));
  const sorted = rows.map((r) => r.price).sort((a, b) => a - b);
  return { n: sorted.length, medianBasic: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null };
}
