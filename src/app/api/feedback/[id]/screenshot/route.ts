import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { getRole, roleAtLeast } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { readFileStream } from "@/lib/storage";

/** A report's screenshot, for the project's team only. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const [r] = await db.select().from(feedbackReports).where(eq(feedbackReports.id, id)).limit(1);
  if (!r?.screenshotKey || !roleAtLeast(await getRole(r.projectId, user.id), "contractor")) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(readFileStream(r.screenshotKey), {
    headers: { "Content-Type": r.screenshotMime ?? "application/octet-stream", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
