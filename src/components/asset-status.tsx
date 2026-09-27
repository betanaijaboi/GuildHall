import { CheckCircle2, Clock, RotateCcw } from "lucide-react";

const STYLE = {
  in_review: { label: "In review", color: "#fbbf24", icon: Clock },
  changes_requested: { label: "Changes requested", color: "#fb7185", icon: RotateCcw },
  approved: { label: "Approved", color: "#34d399", icon: CheckCircle2 },
} as const;

export function AssetStatusChip({ status }: { status: keyof typeof STYLE }) {
  const { label, color, icon: Icon } = STYLE[status];
  return (
    <span className="chip-tint backdrop-blur" style={{ "--c": color, background: `color-mix(in oklab, ${color} 25%, rgb(0 0 0 / 0.55))` } as React.CSSProperties}>
      <Icon size={12} /> {label}
    </span>
  );
}
