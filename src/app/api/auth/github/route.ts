import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env, githubConfigured } from "@/lib/env";

export async function GET() {
  if (!githubConfigured()) return NextResponse.redirect(new URL("/login?error=github_not_configured", env.appUrl));
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("gh_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.github.clientId);
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
