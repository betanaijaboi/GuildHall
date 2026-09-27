"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { channels, huddleCaptions, huddles } from "@/db/schema";
import { getRole, loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { canAccessChannel, channelInWorkspace } from "@/lib/channel-access";
import { loadHuddle, recapper } from "@/lib/huddle-server";
import { activeParticipants, createRecapTasks, endHuddle, startHuddle } from "@/lib/huddles-db";
import { publishHuddle } from "@/lib/pubsub";

export async function startHuddleAction(slug: string, channelId: string): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");
  const [channel] = await db.select().from(channels).where(eq(channels.id, z.string().uuid().parse(channelId))).limit(1);
  if (!channel || channel.kind === "github" || !(await channelInWorkspace(db, project.id, channel)) || !(await canAccessChannel(db, channel.id, user.id))) throw new Error("Channel not found");
  const { huddle } = await startHuddle(db, channel.id, user.id);
  redirect(`/huddle/${huddle.id}`);
}

async function inCall(huddleId: string) {
  const user = await requireUser();
  const row = await loadHuddle(huddleId, user.id);
  if (!row || row.huddle.endedAt) throw new Error("This huddle has ended");
  if (!(await activeParticipants(db, huddleId)).some((p) => p.id === user.id)) throw new Error("Join the huddle first");
  return { user, ...row };
}

/** Anyone in the call can end it for everyone. */
export async function endHuddleAction(huddleId: string): Promise<void> {
  await inCall(huddleId);
  await endHuddle(db, huddleId, recapper());
  redirect(`/huddle/${huddleId}`);
}

export async function saveHuddleNotes(huddleId: string, text: string): Promise<void> {
  const { user } = await inCall(huddleId);
  const notes = z.string().max(20_000).parse(text);
  await db.update(huddles).set({ notes }).where(and(eq(huddles.id, huddleId)));
  publishHuddle(huddleId, { type: "notes", from: user.id, text: notes });
}

/** A final caption line from the speaker's own browser (opt-in). */
export async function addCaption(huddleId: string, text: string): Promise<void> {
  const { user } = await inCall(huddleId);
  const line = z.string().trim().min(1).max(1000).parse(text);
  await db.insert(huddleCaptions).values({ huddleId, userId: user.id, text: line });
  publishHuddle(huddleId, { type: "caption", from: user.id, name: user.name, text: line });
}

/** Members of the project that owns the channel turn recap actions into tasks. */
export async function createRecapTasksAction(huddleId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const row = await loadHuddle(huddleId, user.id);
  if (!row) throw new Error("Huddle not found");
  if (!roleAtLeast(await getRole(row.channel.projectId, user.id), "member")) throw new Error("Only team members can add tasks");
  const indices = form.getAll("action").map((v) => z.coerce.number().int().min(0).max(50).parse(v));
  await createRecapTasks(db, huddleId, indices, user.name);
  revalidatePath(`/huddle/${huddleId}`);
}
