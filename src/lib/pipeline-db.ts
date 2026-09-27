import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { pipelineItems, tasks, users } from "@/db/schema";
import { channelByName, postMessage, type Notify } from "./messages";
import { publish } from "./pubsub";
import { currentStage, templateById } from "./pipelines";

const CHANNEL_FOR: Record<string, string> = { art: "art", audio: "audio", design: "design", narrative: "design" };

export function pipelineChannel(template: string): string {
  return CHANNEL_FOR[templateById(template)?.discipline ?? ""] ?? "general";
}

export async function stageTasks(db: Db, itemId: string) {
  return db.select().from(tasks).where(eq(tasks.pipelineItemId, itemId)).orderBy(asc(tasks.stageIndex));
}

/** Announce that a stage finished and who's up next. */
export async function announceStageDone(db: Db, projectId: string, itemId: string, doneIndex: number, notify: Notify = publish) {
  const [item] = await db.select().from(pipelineItems).where(eq(pipelineItems.id, itemId)).limit(1);
  if (!item) return;
  const stages = await stageTasks(db, itemId);
  const next = stages[doneIndex + 1];
  const nextOwner = next?.assigneeId ? (await db.select({ handle: users.handle }).from(users).where(eq(users.id, next.assigneeId)).limit(1))[0] : undefined;
  const channel = await channelByName(db, projectId, pipelineChannel(item.template));
  if (!channel) return;
  await postMessage(db, {
    channelId: channel.id,
    authorId: null,
    threadKey: `pipeline:${item.id}`,
    body: next
      ? `${item.name}: ${item.stages[doneIndex]} is done. ${item.stages[doneIndex + 1]} is unlocked${nextOwner ? `, @${nextOwner.handle} you're up` : ""}.`
      : `${item.name} finished its pipeline! 🎉`,
  }, notify);
}

/** Complete the stage currently in play (used when the linked asset review is approved). */
export async function completeCurrentStage(db: Db, projectId: string, itemId: string): Promise<boolean> {
  const stages = await stageTasks(db, itemId);
  const idx = currentStage(stages.map((s) => s.status));
  if (idx < 0) return false;
  await db.update(tasks).set({ status: "done", completedAt: new Date() }).where(and(eq(tasks.id, stages[idx].id), eq(tasks.projectId, projectId)));
  await announceStageDone(db, projectId, itemId, idx);
  return true;
}
