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
  bus.emit("channel:*", channelId, event);
}

/** Every channel event (server-side integrations such as the Discord mirror). */
export function subscribeAll(fn: (channelId: string, e: ChannelEvent) => void): () => void {
  bus.on("channel:*", fn);
  return () => bus.off("channel:*", fn);
}

export function subscribe(channelId: string, fn: (e: ChannelEvent) => void): () => void {
  const key = `channel:${channelId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}

// --- Huddles (C5): signalling and presence ------------------------------------------------------

export type HuddleEvent =
  | { type: "presence"; participants: { id: string; name: string; handle: string }[] }
  | { type: "signal"; from: string; kind: "offer" | "answer" | "ice"; data: unknown }
  | { type: "state"; from: string; session: string; mic: boolean; cam: boolean; screen: boolean }
  | { type: "draw"; from: string; data: unknown }
  | { type: "caption"; from: string; name: string; text: string }
  | { type: "notes"; from: string; text: string }
  | { type: "ended"; recapUrl: string };

/** Broadcast to everyone in the huddle (`to` omitted) or deliver to one participant. */
export function publishHuddle(huddleId: string, event: HuddleEvent, to?: string): void {
  bus.emit(to ? `huddle:${huddleId}:${to}` : `huddle:${huddleId}`, event);
}

/** Receive broadcasts plus events addressed to `userId`. */
export function subscribeHuddle(huddleId: string, userId: string, fn: (e: HuddleEvent) => void): () => void {
  const keys = [`huddle:${huddleId}`, `huddle:${huddleId}:${userId}`];
  for (const k of keys) bus.on(k, fn);
  return () => keys.forEach((k) => bus.off(k, fn));
}
