import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for live chat updates (SSE). Good for a single app instance; swap for
 * Redis pub/sub before running more than one (see architecture.md → Scaling path).
 */
const g = globalThis as unknown as { guildhallBus?: EventEmitter };
const bus = g.guildhallBus ?? new EventEmitter();
bus.setMaxListeners(0);
g.guildhallBus = bus;

export type ChannelEvent = { type: "message"; messageId: string; threadRootId: string | null };

export function publish(channelId: string, event: ChannelEvent): void {
  bus.emit(`channel:${channelId}`, event);
}

export function subscribe(channelId: string, fn: (e: ChannelEvent) => void): () => void {
  const key = `channel:${channelId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}
