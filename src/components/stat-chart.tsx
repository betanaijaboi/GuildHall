import { sparkPath, trend } from "@/lib/analytics";

/** A stat with an animated sparkline (the line draws itself in) and the change vs the previous half. */
export function StatChart({ label, values, days, accent = "#a78bfa" }: { label: string; values: number[]; days: string[]; accent?: string }) {
  const total = values.reduce((a, b) => a + b, 0);
  const t = trend(values);
  const W = 280;
  const H = 64;
  const path = sparkPath(values, W, H);
  const id = `g-${label.replace(/\W/g, "")}`;
  return (
    <div className="card space-y-2" data-testid={`stat-${label.toLowerCase().replace(/\W+/g, "-")}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-fg-muted">{label}</span>
        {t !== null && t !== 0 && <span className={`ml-auto text-xs font-semibold ${t > 0 ? "text-good" : "text-bad"}`}>{t > 0 ? "▲" : "▼"} {Math.abs(t)}%</span>}
      </div>
      <div className="font-display text-3xl font-bold tabular-nums">{total}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={`${label} per day, ${days[0]} to ${days[days.length - 1]}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.35" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {path && <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />}
        {path && <path d={path} fill="none" stroke={accent} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="[stroke-dasharray:1] [stroke-dashoffset:1] animate-[draw_1.2s_ease-out_forwards]" />}
      </svg>
      <div className="flex justify-between text-[10px] text-fg-muted"><span>{days[0]?.slice(5)}</span><span>{days[days.length - 1]?.slice(5)}</span></div>
    </div>
  );
}

export function SourceBars({ sources }: { sources: { source: string; n: number }[] }) {
  const max = Math.max(1, ...sources.map((s) => s.n));
  return sources.length === 0 ? (
    <p className="text-sm text-fg-muted">No visits yet.</p>
  ) : (
    <ul className="space-y-1.5">
      {sources.map((s) => (
        <li key={s.source} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate">{s.source}</span>
          <span className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-700" style={{ width: `${(s.n / max) * 70}%`, minWidth: 4 }} />
          <span className="text-xs text-fg-muted">{s.n}</span>
        </li>
      ))}
    </ul>
  );
}
