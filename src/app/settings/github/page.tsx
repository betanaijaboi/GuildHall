import { eq } from "drizzle-orm";
import { db } from "@/db";
import { githubInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { githubConfigured, githubInstallUrl } from "@/lib/env";

export const metadata = { title: "GitHub" };

const ERRORS: Record<string, string> = {
  sign_in_with_github_first: "Link your GitHub account first, then install the app — so we can confirm the installation is yours.",
};

export default async function GitHubSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const installations = await db.select().from(githubInstallations).where(eq(githubInstallations.installedByUserId, user.id));
  const installUrl = githubInstallUrl();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="h1">GitHub</h1>
      {error && <p className="rounded-md border border-warn/40 p-3 text-sm text-warn">{ERRORS[error] ?? error}</p>}
      {!githubConfigured() && (
        <p className="card text-sm text-fg-muted">
          This server has no GitHub App configured, so linking and webhooks are off. Follow <code>docs/github-app.md</code>.
        </p>
      )}
      <section className="card space-y-2">
        <h2 className="h2">Account</h2>
        {user.githubLogin ? (
          <p className="text-sm">Linked as <span className="font-medium">@{user.githubLogin}</span>.</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">Link GitHub to be added to project repos and earn verified contribution stats.</p>
            {githubConfigured() && <a href="/api/auth/github" className="btn">Link GitHub account</a>}
          </>
        )}
      </section>
      <section className="card space-y-3">
        <h2 className="h2">App installations</h2>
        <p className="text-sm text-fg-muted">
          Install the Guildhall GitHub App on the accounts or organisations that own your game repos, then link repos from a
          project&apos;s settings. You choose exactly which repositories the app can see.
        </p>
        {installations.length > 0 && (
          <ul className="space-y-1 text-sm">
            {installations.map((i) => (
              <li key={i.id}>
                {i.accountLogin} <span className="text-fg-muted">({i.accountType}{i.suspended ? ", suspended" : ""})</span>
              </li>
            ))}
          </ul>
        )}
        {installUrl && user.githubLogin && <a href={installUrl} className="btn">Install on GitHub</a>}
      </section>
    </div>
  );
}
