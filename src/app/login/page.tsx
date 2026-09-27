import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { devLoginEnabled, githubConfigured } from "@/lib/env";
import { GithubIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { safeNext } from "@/lib/next-path";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  github_not_configured: "GitHub sign-in isn't configured on this server yet.",
  oauth_state: "The sign-in request expired or was tampered with. Please try again.",
  oauth_exchange: "GitHub didn't accept the sign-in. Please try again.",
  unknown_user: "No such user.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextParam } = await searchParams;
  const next = safeNext(nextParam);
  if (await getCurrentUser()) redirect(next ?? "/projects");
  const devUsers = devLoginEnabled() ? await db.select().from(users).orderBy(asc(users.handle)).limit(20) : [];

  return (
    <div className="mx-auto max-w-sm space-y-6 py-10 text-center">
      <div className="logo-hero flex justify-center animate-float-slow"><LogoMark size={88} /></div>
      <div>
        <h1 className="h1">Enter the <span className="text-gradient">guildhall</span></h1>
        <p className="mt-1 text-sm text-fg-muted">{next?.startsWith("/invite/") ? "Sign in to accept your invite." : "Find your party, build your game."}</p>
      </div>
      {error && <p className="rounded-md border border-bad/40 p-3 text-sm text-bad">{ERRORS[error] ?? "Sign-in failed."}</p>}
      {githubConfigured() ? (
        <a href={next ? `/api/auth/github?next=${encodeURIComponent(next)}` : "/api/auth/github"} className="btn w-full py-2.5"><GithubIcon size={18} /> Continue with GitHub</a>
      ) : (
        <p className="text-sm text-fg-muted">GitHub sign-in isn't configured. See <code>docs/github-app.md</code>.</p>
      )}
      {devUsers.length > 0 && (
        <form action="/api/auth/dev" method="post" className="card space-y-3 text-left">
          <p className="text-sm font-medium">Development login</p>
          {next && <input type="hidden" name="next" value={next} />}
          <select name="handle" className="input">
            {devUsers.map((u) => (
              <option key={u.id} value={u.handle}>{u.name} (@{u.handle})</option>
            ))}
          </select>
          <button className="btn-secondary w-full">Continue as this user</button>
        </form>
      )}
    </div>
  );
}
