import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { memberships, projects, users } from "@/db/schema";
import { sourceOf } from "@/lib/analytics";
import { recordView } from "@/lib/analytics-db";
import { ownHost, visitorFor } from "@/lib/analytics-server";
import { getCurrentUser } from "@/lib/auth";

const body = z.object({ type: z.enum(["profile", "project"]), id: z.string().uuid(), referrer: z.string().max(2000).optional() });

/** View beacon from public profile and project pages. Self-views and private projects aren't counted. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const { type, id, referrer } = parsed.data;
  const user = await getCurrentUser();
  const visitor = visitorFor(req, user?.id ?? null);
  if (!visitor) return new NextResponse(null, { status: 204 });
  if (type === "profile") {
    if (user?.id === id) return new NextResponse(null, { status: 204 });
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!u) return new NextResponse(null, { status: 204 });
  } else {
    const [p] = await db.select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, id)).limit(1);
    if (!p || p.visibility !== "public") return new NextResponse(null, { status: 204 });
    if (user) {
      const [m] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.projectId, id), eq(memberships.userId, user.id))).limit(1);
      if (m) return new NextResponse(null, { status: 204 });
    }
  }
  await recordView(db, { subjectType: type, subjectId: id, day: visitor.day, visitorHash: visitor.hash, source: sourceOf(referrer ?? null, ownHost()) });
  return new NextResponse(null, { status: 204 });
}
