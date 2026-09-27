import type { MessageCard } from "@/db/schema";

const STATE_STYLE: Record<string, string> = {
  open: "text-good",
  merged: "text-accent",
  closed: "text-bad",
  draft: "text-fg-muted",
  failure: "text-bad",
  timed_out: "text-bad",
};

const ICON: Record<MessageCard["kind"], string> = {
  pull_request: "⇄",
  issue: "◎",
  push: "↑",
  release: "◆",
  check: "✕",
  digest: "☰",
};

export function MessageCardView({ card }: { card: MessageCard }) {
  return (
    <div className="mt-1.5 max-w-xl rounded-md border border-border border-l-4 border-l-accent bg-muted/50 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden>{ICON[card.kind]}</span>
        {card.url ? (
          <a href={card.url} target="_blank" rel="noreferrer" className="font-medium link">
            {card.title}
            {card.number ? ` #${card.number}` : ""}
          </a>
        ) : (
          <span className="font-medium">{card.title}</span>
        )}
        {card.state && <span className={`ml-auto text-xs font-medium uppercase ${STATE_STYLE[card.state] ?? "text-fg-muted"}`}>{card.state}</span>}
      </div>
      {card.repo && <div className="mt-0.5 text-xs text-fg-muted">{card.repo}{card.actor ? ` · ${card.actor}` : ""}</div>}
      {card.lines && card.lines.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
          {card.lines.map((l, i) => (
            <li key={i} className="truncate">• {l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
