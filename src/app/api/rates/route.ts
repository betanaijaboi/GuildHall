import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { gigPriceSummary, rateSummary } from "@/lib/rates-db";
import { REGIONS } from "@/lib/rates";
import { isSkillId, SENIORITIES } from "@/lib/taxonomy";

/** Public aggregate rates for a skill. Returns only k-anonymous summaries. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const skill = q.get("skill") ?? "";
  if (!isSkillId(skill)) return NextResponse.json({ error: "unknown skill" }, { status: 400 });
  const seniority = SENIORITIES.find((s) => s === q.get("seniority")) ?? undefined;
  const region = REGIONS.find((r) => r.id === q.get("region"))?.id;
  const [rates, gigsSummary] = await Promise.all([rateSummary(db, skill, { seniority, region }), gigPriceSummary(db, skill)]);
  return NextResponse.json({ rates, gigs: gigsSummary }, { headers: { "Cache-Control": "public, max-age=300" } });
}
