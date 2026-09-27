import { Shield } from "lucide-react";
import type { Rank } from "@/lib/rank";

export function RankBadge({ rank, size = "sm" }: { rank: Pick<Rank, "label" | "color" | "id">; size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="relative inline-flex h-16 w-16 items-center justify-center" title={`${rank.label} rank`}>
        <Shield size={64} strokeWidth={1.5} style={{ color: rank.color, filter: `drop-shadow(0 0 12px ${rank.color}88)` }} fill={`${rank.color}33`} className="animate-float-slow" />
        <span className="absolute font-display text-lg font-bold" style={{ color: rank.color }}>{rank.label[0]}</span>
      </span>
    );
  }
  return (
    <span className="chip-tint" style={{ "--c": rank.color } as React.CSSProperties} title={`Guild Rank: ${rank.label}`}>
      <Shield size={11} fill="currentColor" fillOpacity={0.3} /> {rank.label}
    </span>
  );
}
