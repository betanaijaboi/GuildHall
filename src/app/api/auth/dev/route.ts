import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { devLoginEnabled, env } from "@/lib/env";

/** Local development only: sign in as a seeded user without GitHub. Disabled in production. */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const handle = String((await req.formData()).get("handle") ?? "");
  const [user] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!user) return NextResponse.redirect(new URL("/login?error=unknown_user", env.appUrl), 303);
  await createSession(user.id);
  return NextResponse.redirect(new URL("/projects", env.appUrl), 303);
}
