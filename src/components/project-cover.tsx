/**
 * Generated cover art for a project: a gradient and floating shapes seeded by the slug, so
 * every project gets a distinct banner without anyone uploading art.
 */
const PALETTES = [
  ["#7c3aed", "#22d3ee"], ["#db2777", "#f59e0b"], ["#0ea5e9", "#10b981"], ["#6366f1", "#ec4899"],
  ["#f97316", "#8b5cf6"], ["#14b8a6", "#6366f1"], ["#e11d48", "#7c3aed"], ["#16a34a", "#0ea5e9"],
];

function seeded(slug: string) {
  let h = 2166136261;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function projectColors(slug: string): [string, string] {
  const r = seeded(slug);
  return PALETTES[Math.floor(r() * PALETTES.length)] as [string, string];
}

export function ProjectCover({ slug, className = "h-28" }: { slug: string; className?: string }) {
  const r = seeded(slug);
  const [a, b] = PALETTES[Math.floor(r() * PALETTES.length)];
  const shapes = Array.from({ length: 16 }, (_, i) => ({
    x: r() * 300, y: r() * 100, s: 8 + r() * 22, kind: Math.floor(r() * 4), rot: r() * 360, delay: -r() * 8, i,
  }));
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(120deg, ${a}, ${b})` }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {shapes.map((s) => (
          <g key={s.i} opacity={0.22} fill="#fff" style={{ animation: `float ${7 + (s.i % 4)}s ease-in-out ${s.delay}s infinite`, transformBox: "fill-box", transformOrigin: "center" }}>
            {s.kind === 0 && <rect x={s.x} y={s.y} width={s.s / 3} height={s.s / 3} transform={`rotate(${s.rot} ${s.x} ${s.y})`} />}
            {s.kind === 1 && <circle cx={s.x} cy={s.y} r={s.s / 6} />}
            {s.kind === 2 && <path d={`M${s.x} ${s.y - s.s / 5} L${s.x + s.s / 5} ${s.y + s.s / 6} L${s.x - s.s / 5} ${s.y + s.s / 6} Z`} />}
            {s.kind === 3 && <path d={`M${s.x - s.s / 6} ${s.y} H${s.x + s.s / 6} M${s.x} ${s.y - s.s / 6} V${s.y + s.s / 6}`} stroke="#fff" strokeWidth={1.2} />}
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}

export function ProjectCrest({ slug, name, size = 56 }: { slug: string; name: string; size?: number }) {
  const [a, b] = projectColors(slug);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-display font-bold text-white shadow-xl"
      style={{
        width: size, height: size, fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        clipPath: "polygon(50% 0, 93% 22%, 93% 70%, 50% 100%, 7% 70%, 7% 22%)",
      }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}
