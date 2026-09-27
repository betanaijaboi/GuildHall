import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { env, githubConfigured } from "@/lib/env";
import { safeNext } from "@/lib/next-path";

export async function GET(req: NextRequest) {
  if (!githubConfigured()) return NextResponse.redirect(new URL("/login?error=github_not_configured", env.appUrl));
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("gh_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  // Where to land after sign-in (e.g. back on a guest invite).
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (next) (await cookies()).set("gh_next", next, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.github.clientId);
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
