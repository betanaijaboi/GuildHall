/** Living GDD (C7): default page tree, safe embeds and progress. Pure, unit-tested. */

export const DEFAULT_GDD: { emoji: string; title: string; body: string }[] = [
  { emoji: "🧭", title: "Overview", body: "## Elevator pitch\n\n## Design pillars\n- \n\n## Core loop\n1. \n\n## Target platforms & audience\n" },
  { emoji: "⚙️", title: "Mechanics", body: "## Player verbs\n- \n\n## Systems\n\n## Progression\n" },
  { emoji: "🧙", title: "Characters", body: "## Protagonist\n\n## Supporting cast\n" },
  { emoji: "🌍", title: "World & lore", body: "## Setting\n\n## History\n\n## Factions\n" },
  { emoji: "🗺️", title: "Levels", body: "## Level list\n| Level | Purpose | Status |\n|---|---|---|\n" },
  { emoji: "🎨", title: "Art direction", body: "## Style targets\n\n## Palette & lighting\n\n## References\n" },
  { emoji: "🎼", title: "Audio direction", body: "## Music\n\n## SFX\n\n## Voice\n" },
  { emoji: "🛠️", title: "Tech", body: "## Engine & version\n\n## Performance targets\n\n## Build & CI\n" },
];

/**
 * Turn a Figma or Miro share link into an embeddable iframe URL. Anything else returns null, so
 * arbitrary sites can never be framed inside the workspace.
 */
export function embedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.hostname === "www.figma.com" || u.hostname === "figma.com") {
    if (!/^\/(file|design|proto|board|slides)\//.test(u.pathname)) return null;
    return `https://www.figma.com/embed?embed_host=guildhall&url=${encodeURIComponent(u.toString())}`;
  }
  if (u.hostname === "miro.com") {
    const m = /^\/app\/board\/([A-Za-z0-9_=-]+)\/?/.exec(u.pathname);
    return m ? `https://miro.com/app/live-embed/${m[1]}/` : null;
  }
  return null;
}

export type LinkStatus = { type: "task"; status: "todo" | "doing" | "done" } | { type: "pipeline"; progress: number } | { type: "asset"; status: "in_review" | "changes_requested" | "approved" };

/** % complete of everything linked to a page: tasks done, pipeline progress, assets approved. */
export function pageProgress(links: LinkStatus[]): number | null {
  if (!links.length) return null;
  const score = links.reduce((n, l) => {
    if (l.type === "task") return n + (l.status === "done" ? 1 : l.status === "doing" ? 0.5 : 0);
    if (l.type === "pipeline") return n + l.progress / 100;
    return n + (l.status === "approved" ? 1 : 0);
  }, 0);
  return Math.round((score / links.length) * 100);
}

/** Build the page tree from flat rows. */
export function buildTree<T extends { id: string; parentId: string | null; position: number }>(rows: T[]): (T & { children: T[] })[] {
  const roots = rows.filter((r) => !r.parentId).sort((a, b) => a.position - b.position);
  return roots.map((r) => ({ ...r, children: rows.filter((c) => c.parentId === r.id).sort((a, b) => a.position - b.position) }));
}
