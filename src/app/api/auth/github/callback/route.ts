import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { safeNext } from "@/lib/next-path";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { githubInstallations, users } from "@/db/schema";
import { createSession, getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { exchangeOAuthCode, fetchGitHubUser, fetchUserInstallationIds, getInstallation } from "@/lib/github/client";
import { isValidHandle } from "@/lib/slug";

/**
 * Handles both "Sign in with GitHub" and the post-installation redirect (enable "Request user
 * authorization (OAuth) during installation" on the GitHub App so installs land here with a code).
 * The user token is used only during this request and never stored.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const installationId = params.get("installation_id");
  const jar = await cookies();
  const expectedState = jar.get("gh_oauth_state")?.value;
  jar.delete("gh_oauth_state");
  const next = safeNext(jar.get("gh_next")?.value);
  jar.delete("gh_next");

  const stateValid = Boolean(expectedState) && params.get("state") === expectedState;
  // Installation redirects don't carry our state, so they may only record installations for an
  // already signed-in user whose linked GitHub account matches — never sign in or link accounts.
  if (!code || (!stateValid && !installationId)) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", env.appUrl));
  }

  let token: string;
  try {
    token = await exchangeOAuthCode(code);
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange", env.appUrl));
  }
  const gh = await fetchGitHubUser(token);
  const current = await getCurrentUser();

  if (!stateValid) {
    if (!current || current.githubId !== gh.id) {
      return NextResponse.redirect(new URL("/settings/github?error=sign_in_with_github_first", env.appUrl));
    }
    await recordInstallation(Number(installationId), token, current.id);
    return NextResponse.redirect(new URL("/settings/github", env.appUrl));
  }

  // Link to the signed-in account, or find/create the account for this GitHub user.
  let userId: string;
  const [existing] = await db.select().from(users).where(eq(users.githubId, gh.id)).limit(1);
  if (current) {
    if (existing && existing.id !== current.id) {
      return NextResponse.redirect(new URL("/settings/profile?error=github_linked_elsewhere", env.appUrl));
    }
    await db.update(users).set({ githubId: gh.id, githubLogin: gh.login }).where(eq(users.id, current.id));
    userId = current.id;
  } else if (existing) {
    await db.update(users).set({ githubLogin: gh.login, avatarUrl: existing.avatarUrl ?? gh.avatar_url }).where(eq(users.id, existing.id));
    userId = existing.id;
  } else {
    let handle = gh.login.toLowerCase();
    const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
    if (clash || !isValidHandle(handle)) handle = `${handle.slice(0, 30)}-${gh.id.toString(36)}`.slice(0, 39);
    const [created] = await db
      .insert(users)
      .values({ handle, name: gh.name || gh.login, avatarUrl: gh.avatar_url, bio: gh.bio ?? "", githubId: gh.id, githubLogin: gh.login })
      .returning();
    userId = created.id;
  }
  if (!current) await createSession(userId);

  if (installationId) {
    await recordInstallation(Number(installationId), token, userId);
    return NextResponse.redirect(new URL("/settings/github", env.appUrl));
  }
  return NextResponse.redirect(new URL(next ?? (existing || current ? "/projects" : "/settings/profile?welcome=1"), env.appUrl));
}

/** Record an installation only if the GitHub user can actually access it. */
async function recordInstallation(id: number, token: string, userId: string) {
  if (!Number.isSafeInteger(id)) return;
  const accessible = await fetchUserInstallationIds(token);
  if (!accessible.includes(id)) return;
  const inst = await getInstallation(id);
  const account = inst.account as { login?: string; slug?: string; type?: string } | null;
  await db
    .insert(githubInstallations)
    .values({ id, accountLogin: account?.login ?? account?.slug ?? "unknown", accountType: account?.type ?? "Organization", installedByUserId: userId })
    .onConflictDoUpdate({ target: githubInstallations.id, set: { installedByUserId: userId, suspended: false } });
}
