/** Public roadmap (C18): Now / Next / Later / Shipped, ordered by community votes. */

export const COLUMNS = [
  { id: "now", label: "Now", hint: "In development", color: "#34d399" },
  { id: "next", label: "Next", hint: "Up after that", color: "#22d3ee" },
  { id: "later", label: "Later", hint: "On our radar", color: "#a78bfa" },
  { id: "shipped", label: "Shipped", hint: "Out in a build", color: "#fbbf24" },
] as const;

export type ColumnId = (typeof COLUMNS)[number]["id"];

export type Rankable = { id: string; column: ColumnId; votes: number; createdAt: Date; shippedAt: Date | null };

/** Open columns sort by votes (then oldest first, so early ideas keep their place); shipped by date. */
export function rankItems<T extends Rankable>(items: T[]): Record<ColumnId, T[]> {
  const out = { now: [], next: [], later: [], shipped: [] } as Record<ColumnId, T[]>;
  for (const i of items) out[i.column].push(i);
  for (const c of ["now", "next", "later"] as const) out[c].sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());
  out.shipped.sort((a, b) => (b.shippedAt?.getTime() ?? 0) - (a.shippedAt?.getTime() ?? 0));
  return out;
}

/** Shipped items can't be voted on; everything else can. */
export const canVote = (column: ColumnId) => column !== "shipped";
