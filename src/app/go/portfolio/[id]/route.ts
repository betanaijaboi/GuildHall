import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { portfolioItems } from "@/db/schema";
import { recordClick } from "@/lib/analytics-db";
import { visitorFor } from "@/lib/analytics-server";
import { getCurrentUser } from "@/lib/auth";

/** Count a portfolio click-through, then send the visitor on to the piece. Only stored URLs: no open redirect. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [item] = await db.select().from(portfolioItems).where(eq(portfolioItems.id, id)).limit(1);
  if (!item || !/^https?:\/\//.test(item.url)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  const visitor = visitorFor(req, user?.id ?? null);
  if (visitor && user?.id !== item.userId) await recordClick(db, item.id, visitor.day, visitor.hash);
  return NextResponse.redirect(item.url, { status: 302, headers: { "Referrer-Policy": "origin", "Cache-Control": "no-store" } });
}
