/** Forum topic helpers (C13). */

export const TOPIC_STATUSES = ["open", "accepted", "parked", "done"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const STATUS_COLOR: Record<TopicStatus, string> = { open: "#22d3ee", accepted: "#34d399", parked: "#9a96b3", done: "#a78bfa" };

export const SUGGESTED_TAGS = ["mechanic", "narrative", "art", "audio", "ui", "level", "tech", "needs-art", "needs-design", "bug"];

/** Normalise user-entered tags: lower-case slugs, de-duplicated, at most 5. */
export function normaliseTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[,\s]+/);
  const tags = raw
    .map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 24))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 5);
}

export type TopicSort = "votes" | "new" | "active";

export function sortTopics<T extends { votes: number; createdAt: Date; lastActivity: Date }>(topics: T[], sort: TopicSort): T[] {
  const copy = [...topics];
  if (sort === "votes") return copy.sort((a, b) => b.votes - a.votes || b.lastActivity.getTime() - a.lastActivity.getTime());
  if (sort === "new") return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return copy.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}
