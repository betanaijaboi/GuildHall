import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { feedbackReports, roadmapItems, roadmapVotes } from "@/db/schema";
import type { ColumnId } from "@/lib/roadmap";
import { canVote } from "@/lib/roadmap";
import { channelByName, postMessage, type Notify } from "@/lib/messages";
import { publish } from "@/lib/pubsub";

/** Toggle a vote. Only public, unshipped items in the given project can be voted on. Returns the new state. */
export async function toggleRoadmapVote(db: Db, projectId: string, itemId: string, userId: string): Promise<boolean> {
  const [item] = await db.select().from(roadmapItems).where(and(eq(roadmapItems.id, itemId), eq(roadmapItems.projectId, projectId), eq(roadmapItems.public, true))).limit(1);
  if (!item || !canVote(item.column)) throw new Error("You can't vote on this item");
  const removed = await db.delete(roadmapVotes).where(and(eq(roadmapVotes.itemId, itemId), eq(roadmapVotes.userId, userId))).returning();
  if (removed.length) return false;
  await db.insert(roadmapVotes).values({ itemId, userId }).onConflictDoNothing();
  return true;
}

/** Move an item; moving into Shipped stamps it and announces it in #general once. */
export async function moveRoadmapItem(db: Db, projectId: string, itemId: string, column: ColumnId, votes: number, notify: Notify = publish): Promise<void> {
  const [before] = await db.select().from(roadmapItems).where(and(eq(roadmapItems.id, itemId), eq(roadmapItems.projectId, projectId))).limit(1);
  if (!before || before.column === column) return;
  await db.update(roadmapItems).set({ column, shippedAt: column === "shipped" ? new Date() : null }).where(eq(roadmapItems.id, itemId));
  if (column === "shipped") {
    const general = await channelByName(db, projectId, "general");
    if (general) await postMessage(db, { channelId: general.id, authorId: null, body: `🚢 Shipped from the roadmap: ${before.title}${votes ? ` (${votes} vote${votes === 1 ? "" : "s"} from players)` : ""}. Worth a devlog post!` }, notify);
  }
}

/** Community suggestions go to the feedback inbox as ideas, where the team triages them. */
export const MAX_SUGGESTIONS_PER_DAY = 5;

export async function suggestIdea(db: Db, projectId: string, user: { id: string; name: string }, title: string, body: string): Promise<void> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(feedbackReports)
    .where(and(eq(feedbackReports.projectId, projectId), eq(feedbackReports.reporterId, user.id), eq(feedbackReports.kind, "idea"), isNull(feedbackReports.playtestId), gt(feedbackReports.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= MAX_SUGGESTIONS_PER_DAY) throw new Error("You've shared plenty of ideas today. Thank you! Try again tomorrow.");
  await db.insert(feedbackReports).values({ projectId, source: "form", kind: "idea", reporterId: user.id, reporterName: user.name, title: title.slice(0, 160), body: body.slice(0, 4000) });
}
