"use client";

import { useEffect, useState } from "react";

const COLORS = ["#8b5cf6", "#22d3ee", "#fbbf24", "#f472b6", "#34d399"];

/** One-shot celebratory burst, e.g. after completing a milestone. */
export function Confetti() {
  const [pieces, setPieces] = useState<{ x: number; y: number; r: number; c: string; d: number; s: number }[]>([]);
  useEffect(() => {
    setPieces(
      Array.from({ length: 48 }, () => ({
        x: (Math.random() - 0.5) * 700,
        y: -Math.random() * 420 - 80,
        r: Math.random() * 720 - 360,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        d: Math.random() * 200,
        s: 6 + Math.random() * 6,
      })),
    );
    const t = setTimeout(() => setPieces([]), 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-1/3 z-50 flex justify-center" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-sm"
          style={{
            width: p.s, height: p.s * 0.45, background: p.c,
            animation: `confetti 1.8s cubic-bezier(0.1, 0.6, 0.3, 1) ${p.d}ms both`,
            ["--x" as string]: `${p.x}px`, ["--y" as string]: `${p.y}px`, ["--r" as string]: `${p.r}deg`,
          }}
        />
      ))}
    </div>
  );
}
