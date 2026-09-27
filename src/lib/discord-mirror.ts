import "server-only";
import { db } from "@/db";
import { forwardMessage } from "@/lib/discord-db";
import { subscribeAll } from "@/lib/pubsub";

const g = globalThis as unknown as { guildhallDiscordMirror?: boolean };

/**
 * Start mirroring channel messages to Discord (once per server process). Messages to one webhook
 * go out in order, one at a time, so Discord's per-webhook rate limit is respected.
 */
export function startDiscordMirror(): void {
  if (g.guildhallDiscordMirror) return;
  g.guildhallDiscordMirror = true;
  const queues = new Map<string, Promise<unknown>>();
  subscribeAll((channelId, e) => {
    if (e.type !== "message") return;
    const next = (queues.get(channelId) ?? Promise.resolve())
      .then(() => forwardMessage(db, e.messageId))
      .catch((err) => console.warn("Discord mirror failed", err));
    queues.set(channelId, next);
    void next.finally(() => queues.get(channelId) === next && queues.delete(channelId));
  });
}
