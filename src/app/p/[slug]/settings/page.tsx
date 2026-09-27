import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { githubInstallations, projectRepos } from "@/db/schema";
import { linkRepo, openSetupPullRequest, unlinkRepo } from "@/app/actions/github";
import { updateProject } from "@/app/actions/project";
import { CheckboxRow } from "@/components/skill-picker";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { githubConfigured } from "@/lib/env";
import { listInstallationRepos, type RepoSummary } from "@/lib/github/client";
import { templateFiles } from "@/lib/github/templates";
import { ENGAGEMENTS, PLATFORMS } from "@/lib/taxonomy";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const linked = await db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id));

  let available: (RepoSummary & { installationId: number })[] = [];
  let githubError: string | null = null;
  if (githubConfigured()) {
    const installs = await db.select().from(githubInstallations).where(eq(githubInstallations.installedByUserId, user.id));
    try {
      for (const inst of installs) {
        if (inst.suspended) continue;
        available.push(...(await listInstallationRepos(inst.id)).map((r) => ({ ...r, installationId: inst.id })));
      }
    } catch (err) {
      githubError = (err as Error).message;
    }
    available = available.filter((r) => !linked.some((l) => l.repoId === r.id));
  }
  const template = templateFiles(project.engine, project.name);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <form action={updateProject.bind(null, slug)} className="card space-y-4">
        <h2 className="h2">Project</h2>
        <div>
          <label className="label" htmlFor="pitch">Pitch</label>
          <textarea id="pitch" name="pitch" rows={4} defaultValue={project.pitch} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="engagement">Team arrangement</label>
            <select id="engagement" name="engagement" defaultValue={project.engagement} className="input">
              {ENGAGEMENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="genres">Genres</label>
            <input id="genres" name="genres" defaultValue={project.genres.join(", ")} className="input" />
          </div>
        </div>
        <div>
          <span className="label">Platforms</span>
          <CheckboxRow name="platforms" options={PLATFORMS} selected={project.platforms} />
        </div>
        <div className="text-sm">
          <span className="label">Visibility</span>
          <label className="mr-4"><input type="radio" name="visibility" value="public" defaultChecked={project.visibility === "public"} /> Public</label>
          <label><input type="radio" name="visibility" value="private" defaultChecked={project.visibility === "private"} /> Private</label>
        </div>
        <button className="btn">Save</button>
      </form>

      <section className="card space-y-4">
        <h2 className="h2">GitHub repositories</h2>
        {linked.length === 0 && <p className="text-sm text-fg-muted">No repos linked yet.</p>}
        <ul className="space-y-3">
          {linked.map((r) => (
            <li key={r.repoId} className="flex flex-wrap items-center gap-2">
              <a href={`https://github.com/${r.fullName}`} target="_blank" rel="noreferrer" className="font-medium link">{r.fullName}</a>
              <form action={openSetupPullRequest.bind(null, slug)} className="ml-auto">
                <input type="hidden" name="repoId" value={r.repoId} />
                <button className="btn-secondary">Open setup PR</button>
              </form>
              <form action={unlinkRepo.bind(null, slug)}>
                <input type="hidden" name="repoId" value={r.repoId} />
                <button className="text-sm text-fg-muted hover:text-bad">Unlink</button>
              </form>
            </li>
          ))}
        </ul>

        {!githubConfigured() ? (
          <p className="text-sm text-fg-muted">GitHub isn&apos;t configured on this server (see <code>docs/github-app.md</code>).</p>
        ) : githubError ? (
          <p className="text-sm text-bad">Couldn&apos;t list repositories: {githubError}</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No more repositories available. <Link href="/settings/github" className="link">Install the app</Link> on the account that owns your repo.
          </p>
        ) : (
          <form action={linkRepo.bind(null, slug)} className="flex gap-2">
            <select name="repo" className="input">
              {available.map((r) => (
                <option key={r.id} value={`${r.installationId}:${r.id}`}>{r.fullName}{r.private ? " (private)" : ""}</option>
              ))}
            </select>
            <button className="btn">Link repo</button>
          </form>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">What the setup PR adds for this engine</summary>
          <ul className="mt-2 list-disc pl-5">
            {template.map((f) => <li key={f.path}><code>{f.path}</code></li>)}
          </ul>
          <p className="mt-2 text-fg-muted">
            Binary assets go to Git LFS. GitHub meters LFS storage and bandwidth beyond the free quota, and every CI checkout
            that pulls LFS counts — the CI templates skip LFS unless a job needs assets.
          </p>
        </details>
      </section>
    </div>
  );
}
