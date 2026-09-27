import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { channels, messages, type MessageCard } from "@/db/schema";
import { publish, type ChannelEvent } from "./pubsub";

export type Notify = (channelId: string, event: ChannelEvent) => void;

export const DEFAULT_CHANNELS: { name: string; kind: "chat" | "github" }[] = [
  { name: "general", kind: "chat" },
  { name: "design", kind: "chat" },
  { name: "art", kind: "chat" },
  { name: "code", kind: "chat" },
  { name: "audio", kind: "chat" },
  { name: "builds", kind: "chat" },
  { name: "github", kind: "github" },
];

export async function createDefaultChannels(db: Db, projectId: string): Promise<void> {
  await db
    .insert(channels)
    .values(DEFAULT_CHANNELS.map((c) => ({ projectId, ...c })))
    .onConflictDoNothing();
}

export async function channelByName(db: Db, projectId: string, name: string) {
  const [c] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.projectId, projectId), eq(channels.name, name)))
    .limit(1);
  return c ?? null;
}

export type PostMessageInput = {
  channelId: string;
  authorId: string | null;
  body: string;
  card?: MessageCard;
  threadRootId?: string | null;
  /** Bot messages with the same key in a channel are threaded under the first one. */
  threadKey?: string;
};

/** Pass `notify` to defer live updates, e.g. until the surrounding transaction commits. */
export async function postMessage(db: Db, input: PostMessageInput, notify: Notify = publish) {
  let threadRootId = input.threadRootId ?? null;
  if (!threadRootId && input.threadKey) {
    const [root] = await db
      .select({ id: messages.id, card: messages.card })
      .from(messages)
      .where(and(eq(messages.channelId, input.channelId), eq(messages.threadKey, input.threadKey), isNull(messages.threadRootId)))
      .orderBy(asc(messages.createdAt))
      .limit(1);
    threadRootId = root?.id ?? null;
    // Keep the thread's first card live: a merged/closed PR or issue updates the card people see in the channel.
    if (root?.card && input.card && root.card.kind === input.card.kind && input.card.state && root.card.state !== input.card.state) {
      await db.update(messages).set({ card: { ...root.card, state: input.card.state } }).where(eq(messages.id, root.id));
    }
  }
  const [row] = await db
    .insert(messages)
    .values({
      channelId: input.channelId,
      authorId: input.authorId,
      body: input.body,
      card: input.card,
      threadKey: input.threadKey,
      threadRootId,
    })
    .returning();
  notify(input.channelId, { type: "message", messageId: row.id, threadRootId });
  return row;
}
