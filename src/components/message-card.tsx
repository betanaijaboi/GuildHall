import { CircleDot, GitMerge, Headphones, GitPullRequest, ImageIcon, Package, ScrollText, TriangleAlert, Upload, XCircle, type LucideIcon } from "lucide-react";
import type { MessageCard } from "@/db/schema";

const STATE_COLOR: Record<string, string> = {
  open: "#34d399",
  merged: "#a78bfa",
  closed: "#fb7185",
  draft: "#9a96b3",
  failure: "#fb7185",
  timed_out: "#fb7185",
  in_review: "#fbbf24",
  changes_requested: "#fb7185",
  approved: "#34d399",
  conflict_risk: "#fbbf24",
  live: "#34d399",
  ended: "#9a96b3",
};

function iconFor(card: MessageCard): LucideIcon {
  if (card.kind === "pull_request") return card.state === "merged" ? GitMerge : GitPullRequest;
  if (card.state === "conflict_risk") return TriangleAlert;
  return { issue: CircleDot, push: Upload, release: Package, check: XCircle, digest: ScrollText, pull_request: GitPullRequest, asset: ImageIcon, huddle: Headphones }[card.kind];
}

export function MessageCardView({ card }: { card: MessageCard }) {
  const Icon = iconFor(card);
  const color = STATE_COLOR[card.state ?? ""] ?? (card.kind === "release" ? "#fbbf24" : "#8b5cf6");
  return (
    <div
      className="mt-2 max-w-xl overflow-hidden rounded-xl border bg-surface-2 text-sm transition-colors"
      style={{ borderColor: `color-mix(in oklab, ${color} 35%, var(--color-border))` }}
    >
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {card.url ? (
              <a
                href={card.url}
                {...(card.url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
                className="truncate font-semibold hover:underline"
              >
                {card.title}
                {card.number ? <span className="font-normal text-fg-muted"> {card.kind === "asset" ? `v${card.number}` : `#${card.number}`}</span> : null}
              </a>
            ) : (
              <span className="truncate font-semibold">{card.title}</span>
            )}
            {card.state && (
              <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color, background: `color-mix(in oklab, ${color} 15%, transparent)` }}>
                {card.state.replaceAll("_", " ")}
              </span>
            )}
          </div>
          {card.repo && <div className="mt-0.5 text-xs text-fg-muted">{card.repo}{card.actor ? ` · ${card.actor}` : ""}</div>}
          {card.lines && card.lines.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-border pl-3 text-xs text-fg-muted">
              {card.lines.map((l, i) => <li key={i} className="truncate">{l}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
