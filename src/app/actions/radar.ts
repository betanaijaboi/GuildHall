"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { projectRepos } from "@/db/schema";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fileName } from "@/lib/conflicts";
import { forceUnlock } from "@/lib/github/client";
import { channelByName, postMessage } from "@/lib/messages";

const lockInput = z.object({ path: z.string().min(1).max(400), owner: z.string().min(1).max(100) });

export async function askToRelease(slug: string, input: z.input<typeof lockInput>) {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "contractor");
  const { path, owner } = lockInput.parse(input);
  const channel = await channelByName(db, project.id, "art");
  if (channel) {
    await postMessage(db, { channelId: channel.id, authorId: user.id, body: `@${owner}, could you release your lock on ${fileName(path)} when you're done? I need to work on it. (${path})` });
  }
}

export async function forceReleaseLock(slug: string, input: z.input<typeof lockInput> & { repoId: number; lockId: string }) {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const { path, owner } = lockInput.parse(input);
  const repoId = z.number().int().parse(input.repoId);
  const lockId = z.string().min(1).max(100).parse(input.lockId);
  const [repo] = await db.select().from(projectRepos).where(and(eq(projectRepos.projectId, project.id), eq(projectRepos.repoId, repoId))).limit(1);
  if (!repo) throw new Error("Repo is not linked to this project");
  await forceUnlock(repo.installationId, repo.fullName, lockId);
  const channel = await channelByName(db, project.id, "art");
  if (channel) {
    await postMessage(db, { channelId: channel.id, authorId: null, body: `${user.name} force-released @${owner}'s lock on ${fileName(path)}. @${owner}, pull before you push again so no work is lost.` });
  }
  revalidatePath(`/p/${slug}/assets/radar`);
}
