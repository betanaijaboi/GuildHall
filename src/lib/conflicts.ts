/**
 * Conflict radar: unmergeable files edited by more than one person within a window are where
 * Git game repos lose work. Pure logic here; webhook wiring in github/apply.ts.
 */

export const UNMERGEABLE_EXTENSIONS = [
  "umap", "uasset", "unity", "prefab", "psd", "psb", "kra", "blend", "ma", "mb", "max", "fbx", "spp", "sbs", "sbsar", "ztl", "wav", "aup3",
];

export function isUnmergeable(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return UNMERGEABLE_EXTENSIONS.includes(ext);
}

/** Unmergeable paths touched in a push, de-duplicated across its commits. */
export function unmergeableTouches(commits: { added?: string[]; modified?: string[] }[]): string[] {
  const paths = new Set<string>();
  for (const c of commits) for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) if (isUnmergeable(p)) paths.add(p);
  return [...paths].slice(0, 200);
}

export type Touch = { path: string; actorLogin: string; branch: string; at: Date };

export type Hotspot = { path: string; actors: string[]; branches: string[]; lastAt: Date; crossBranch: boolean };

/** Paths touched by 2+ distinct people within `windowDays` of `now`, most recent first. */
export function findHotspots(touches: Touch[], now: Date, windowDays = 7): Hotspot[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const byPath = new Map<string, Touch[]>();
  for (const t of touches) {
    if (t.at.getTime() < since) continue;
    byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
  }
  const hotspots: Hotspot[] = [];
  for (const [path, list] of byPath) {
    const actors = [...new Set(list.map((t) => t.actorLogin))].sort();
    if (actors.length < 2) continue;
    const branches = [...new Set(list.map((t) => t.branch))].sort();
    hotspots.push({ path, actors, branches, lastAt: new Date(Math.max(...list.map((t) => t.at.getTime()))), crossBranch: branches.length > 1 });
  }
  return hotspots.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
