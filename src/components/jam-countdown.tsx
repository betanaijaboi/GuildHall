"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ticking countdown to a jam's start or end. Digits roll when they change; the page refreshes
 * when the target passes (so the theme reveal and phase flip happen live).
 */
export function JamCountdown({ target, label, compact = false }: { target: string; label: string; compact?: boolean }) {
  const router = useRouter();
  const end = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= end && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [end, router]);
  const ms = Math.max(0, end - (now ?? end));
  const parts = [
    { v: Math.floor(ms / 86_400_000), u: "days" },
    { v: Math.floor((ms % 86_400_000) / 3_600_000), u: "hrs" },
    { v: Math.floor((ms % 3_600_000) / 60_000), u: "min" },
    { v: Math.floor((ms % 60_000) / 1000), u: "sec" },
  ];
  if (compact) {
    return (
      <span className="font-mono text-xs tabular-nums" suppressHydrationWarning>
        {label} {now === null ? "…" : parts[0].v ? `${parts[0].v}d ${parts[1].v}h` : `${pad(parts[1].v)}:${pad(parts[2].v)}:${pad(parts[3].v)}`}
      </span>
    );
  }
  return (
    <div className="space-y-1.5" aria-live="off">
      <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="flex gap-2">
        {parts.map((p) => (
          <div key={p.u} className="flex w-16 flex-col items-center rounded-xl border border-border bg-surface-2 py-2 shadow-inner">
            <span key={now === null ? "x" : p.v} className="animate-pop font-display text-2xl font-bold tabular-nums">{now === null ? "--" : pad(p.v)}</span>
            <span className="text-[10px] uppercase tracking-wider text-fg-muted">{p.u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
