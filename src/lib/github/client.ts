import "server-only";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { env, githubConfigured } from "@/lib/env";
import type { TemplateFile } from "./templates";

let app: App | null = null;

function getApp(): App {
  if (!githubConfigured()) throw new Error("GitHub App is not configured (see .env.example)");
  app ??= new App({
    appId: env.github.appId,
    privateKey: env.github.privateKey,
    Octokit: Octokit.defaults({ userAgent: "guildhall" }),
  });
  return app;
}

/** Octokit authenticated as an installation. Tokens are minted per call and expire after an hour. */
export async function installationClient(installationId: number): Promise<Octokit> {
  return (await getApp().getInstallationOctokit(installationId)) as unknown as Octokit;
}

export async function getInstallation(installationId: number) {
  const { data } = await getApp().octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });
  return data;
}

export type RepoSummary = { id: number; fullName: string; defaultBranch: string; private: boolean };

export async function listInstallationRepos(installationId: number): Promise<RepoSummary[]> {
  const octokit = await installationClient(installationId);
  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
  return repos.map((r) => ({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }));
}

const splitName = (fullName: string) => {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
};

export type GitHubPermission = "pull" | "triage" | "push" | "maintain" | "admin";

/** Invite a user to a repo (requires the optional Administration: write permission). */
export async function inviteCollaborator(installationId: number, fullName: string, login: string, permission: GitHubPermission) {
  const octokit = await installationClient(installationId);
  await octokit.rest.repos.addCollaborator({ ...splitName(fullName), username: login, permission });
}

export async function removeCollaborator(installationId: number, fullName: string, login: string) {
  const octokit = await installationClient(installationId);
  await octokit.rest.repos.removeCollaborator({ ...splitName(fullName), username: login });
}

/**
 * Commit `files` to a new branch as a single commit and open a PR against the default branch.
 * Returns the PR URL. Uses the Git Data API so the whole template lands in one reviewable commit.
 */
export async function openTemplatePullRequest(
  installationId: number,
  fullName: string,
  defaultBranch: string,
  files: TemplateFile[],
): Promise<string> {
  const octokit = await installationClient(installationId);
  const { owner, repo } = splitName(fullName);
  const branch = `guildhall/setup-${Date.now()}`;

  const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: baseSha });
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.content })),
  });
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "chore: Guildhall project setup (LFS, ignore rules, templates)",
    tree: tree.sha,
    parents: [baseSha],
  });
  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: defaultBranch,
    title: "Guildhall project setup",
    body: [
      "Adds engine-appropriate repository setup from Guildhall:",
      "",
      ...files.map((f) => `- \`${f.path}\``),
      "",
      "Binary assets are routed to Git LFS and marked `lockable`. Review the patterns before merging —",
      "files already committed are not migrated automatically (`git lfs migrate import` does that).",
    ].join("\n"),
  });
  return pr.html_url;
}

// --- OAuth (user-to-server) -------------------------------------------------------------

export async function exchangeOAuthCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.github.clientId, client_secret: env.github.clientSecret, code }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`GitHub OAuth failed: ${data.error ?? res.status}`);
  return data.access_token;
}

export type GitHubUser = { id: number; login: string; name: string | null; avatar_url: string; bio: string | null };

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const { data } = await new Octokit({ auth: token, userAgent: "guildhall" }).rest.users.getAuthenticated();
  return data as GitHubUser;
}

/** Installation ids of this app that the user can access — used to verify install ownership. */
export async function fetchUserInstallationIds(token: string): Promise<number[]> {
  const octokit = new Octokit({ auth: token, userAgent: "guildhall" });
  const installs = await octokit.paginate(octokit.rest.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
  return installs.map((i) => i.id);
}
