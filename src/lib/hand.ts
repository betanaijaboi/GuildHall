/** "Your hand" (C19): one queue of everything waiting on you across projects. */

export type HandKind = "sign" | "release" | "fund" | "review" | "task" | "mention";

export type HandItem = {
  key: string;
  kind: HandKind;
  title: string;
  detail: string;
  href: string;
  project: { slug: string; name: string };
  at: Date;
  locked?: boolean;
  doing?: boolean;
};

/** Things that block other people come first; your own work next; mentions last. */
const PRIORITY: Record<HandKind, number> = { sign: 0, release: 1, review: 2, fund: 3, task: 4, mention: 5 };

export function orderHand(items: HandItem[], custom: Map<string, number>): HandItem[] {
  return [...items].sort((a, b) => {
    const ca = custom.get(a.key);
    const cb = custom.get(b.key);
    if (ca != null && cb != null) return ca - cb;
    if (ca != null) return -1;
    if (cb != null) return 1;
    const p = PRIORITY[a.kind] - PRIORITY[b.kind];
    if (p) return p;
    if (a.kind === "task" && Boolean(a.locked) !== Boolean(b.locked)) return a.locked ? 1 : -1;
    if (a.kind === "task" && Boolean(a.doing) !== Boolean(b.doing)) return a.doing ? -1 : 1;
    return b.at.getTime() - a.at.getTime();
  });
}

/** Does a message mention this handle as a whole word? */
export function mentions(body: string, handle: string): boolean {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w-])@${escaped}(?![\\w-])`, "i").test(body);
}
