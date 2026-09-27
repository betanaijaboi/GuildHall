import type { AvatarConfig } from "@/lib/avatar";

/**
 * Pure SVG renderer for an avatar config. No hooks or ids, so it renders identically on the
 * server and in the builder. Parts are drawn back-to-front on a 100×100 canvas; the round
 * crop comes from the wrapper, not the SVG.
 */

const INK = "#1b1726";
const MOUTH = "#2a1620";

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function star(cx: number, cy: number, r: number): string {
  const i = r * 0.32;
  return `M${cx} ${cy - r} L${cx + i} ${cy - i} L${cx + r} ${cy} L${cx + i} ${cy + i} L${cx} ${cy + r} L${cx - i} ${cy + i} L${cx - r} ${cy} L${cx - i} ${cy - i} Z`;
}

function Pattern({ kind }: { kind: AvatarConfig["pattern"] }) {
  const props = { fill: "#fff", opacity: 0.12 };
  if (kind === "dots") {
    const dots = [];
    for (let x = 6; x < 100; x += 12.5) for (let y = 6; y < 100; y += 12.5) dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />);
    return <g {...props}>{dots}</g>;
  }
  if (kind === "stripes") {
    return (
      <g stroke="#fff" strokeWidth={5} opacity={0.08}>
        {[-60, -35, -10, 15, 40, 65, 90].map((o) => <line key={o} x1={o} y1={100} x2={o + 100} y2={0} />)}
      </g>
    );
  }
  if (kind === "stars") {
    return (
      <g {...props} opacity={0.3}>
        {[[14, 16, 4], [84, 12, 3], [88, 40, 2.5], [10, 42, 2.5], [22, 30, 1.8], [78, 26, 2]].map(([x, y, r]) => (
          <path key={`${x}-${y}`} d={star(x, y, r)} />
        ))}
      </g>
    );
  }
  if (kind === "grid") {
    return (
      <g stroke="#fff" strokeWidth={0.6} opacity={0.12}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
          <g key={v}>
            <line x1={v} y1={0} x2={v} y2={100} />
            <line x1={0} y1={v} x2={100} y2={v} />
          </g>
        ))}
      </g>
    );
  }
  return null;
}

function HairBack({ a }: { a: AvatarConfig }) {
  switch (a.hair) {
    case "long":
      return <path d="M26 40 C26 22 40 17 50 17 C60 17 74 22 74 40 L77 82 L23 82 Z" fill={shade(a.hairColor, 0.85)} />;
    case "afro":
      return <circle cx={50} cy={38} r={29} fill={a.hairColor} />;
    case "hood":
      return <path d="M21 52 C21 22 36 11 50 11 C64 11 79 22 79 52 L82 90 L18 90 Z" fill={shade(a.outfit, 0.72)} />;
    default:
      return null;
  }
}

function HairFront({ a }: { a: AvatarConfig }) {
  const fill = a.hairColor;
  switch (a.hair) {
    case "short":
      return <path d="M28 44 C27 26 38 19 50 19 C63 19 73 27 72 44 C68 35 60 30 50 31 C41 31 33 35 28 44 Z" fill={fill} />;
    case "spiky":
      return <path d="M28 44 L29 27 L36 31 L38 18 L45 26 L50 13 L55 26 L62 18 L64 31 L71 27 L72 44 C66 34 58 31 50 31 C42 31 34 34 28 44 Z" fill={fill} />;
    case "long":
      return <path d="M28 44 C27 26 38 19 50 19 C63 19 73 27 72 44 L72 62 C70 50 69 42 64 36 C58 32 42 32 36 36 C31 42 30 50 28 62 Z" fill={fill} />;
    case "bun":
      return (
        <g fill={fill}>
          <circle cx={50} cy={15} r={8} />
          <path d="M28 44 C27 26 38 20 50 20 C63 20 73 27 72 44 C68 35 60 30 50 31 C41 31 33 35 28 44 Z" />
        </g>
      );
    case "mohawk":
      return <path d="M44.5 32 C43 22 45 12 50 8 C55 12 57 22 55.5 32 Z" fill={fill} />;
    case "afro":
      return <path d="M29 42 C30 30 40 26 50 26 C60 26 70 30 71 42 C64 36 36 36 29 42 Z" fill={shade(fill, 1.1)} />;
    case "hood":
      return <path d="M25 54 C25 26 37 15 50 15 C63 15 75 26 75 54 L70 54 C70 33 60 24 50 24 C40 24 30 33 30 54 Z" fill={a.outfit} />;
    default:
      return null;
  }
}

function Eyes({ kind }: { kind: AvatarConfig["eyes"] }) {
  const stroke = { stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const, fill: "none" };
  const dot = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy={47} r={2.9} fill={INK} />
      <circle cx={cx + 1} cy={46} r={0.9} fill="#fff" />
    </g>
  );
  switch (kind) {
    case "dots":
      return <g className="av-eyes">{dot(42)}{dot(58)}</g>;
    case "happy":
      return <g {...stroke}><path d="M38.5 48 Q42 43.5 45.5 48" /><path d="M54.5 48 Q58 43.5 61.5 48" /></g>;
    case "visor":
      return (
        <g>
          <rect x={31} y={41.5} width={38} height={11} rx={5.5} fill="#22d3ee" stroke="#0e7490" strokeWidth={1.4} />
          <rect x={34} y={43.5} width={12} height={2.4} rx={1.2} fill="#fff" opacity={0.65} className="av-shine" />
        </g>
      );
    case "wink":
      return <g>{dot(42)}<path d="M54.5 47.5 Q58 44.5 61.5 47.5" {...stroke} /></g>;
    case "sleepy":
      return <g {...stroke}><path d="M39 47 Q42 49.5 45 47" /><path d="M55 47 Q58 49.5 61 47" /></g>;
    case "stars":
      return <g fill="#fbbf24" stroke={INK} strokeWidth={0.8} className="av-eyes"><path d={star(42, 47, 4.2)} /><path d={star(58, 47, 4.2)} /></g>;
  }
}

function Mouth({ kind }: { kind: AvatarConfig["mouth"] }) {
  const stroke = { stroke: MOUTH, strokeWidth: 2.2, strokeLinecap: "round" as const, fill: "none" };
  switch (kind) {
    case "smile":
      return <path d="M44 56 Q50 61.5 56 56" {...stroke} />;
    case "grin":
      return (
        <g>
          <path d="M43 55 Q50 64.5 57 55 Z" fill={MOUTH} />
          <path d="M44.4 55.6 L55.6 55.6 L55 57.2 L45 57.2 Z" fill="#fff" />
        </g>
      );
    case "flat":
      return <path d="M45 57.5 L55 57.5" {...stroke} />;
    case "open":
      return <ellipse cx={50} cy={57.5} rx={3} ry={3.4} fill={MOUTH} />;
    case "smirk":
      return <path d="M45 57.5 Q51 60 56 55" {...stroke} />;
  }
}

function FacialHair({ a }: { a: AvatarConfig }) {
  const beard = "M30 50 C31 66 40 73 50 73 C60 73 69 66 70 50 C66 60 60 63 50 63 C40 63 34 60 30 50 Z";
  switch (a.facialHair) {
    case "beard":
      return <path d={beard} fill={a.hairColor} />;
    case "stubble":
      return <path d={beard} fill={a.hairColor} opacity={0.35} />;
    case "mustache":
      return <path d="M42 54 Q46 50.5 50 53.3 Q54 50.5 58 54 Q54 56 50 55 Q46 56 42 54 Z" fill={a.hairColor} />;
    default:
      return null;
  }
}

function Accessory({ a }: { a: AvatarConfig }) {
  switch (a.accessory) {
    case "headset":
      return (
        <g>
          <path d="M26 45 C26 18 74 18 74 45" stroke="#2b2b3a" strokeWidth={4} fill="none" />
          <rect x={22} y={40} width={9} height={15} rx={3.5} fill="#2b2b3a" />
          <rect x={69} y={40} width={9} height={15} rx={3.5} fill="#2b2b3a" />
          <circle cx={73.5} cy={47.5} r={1.6} fill="#22d3ee" className="av-led" />
          <path d="M26 53 Q29 63 41 62" stroke="#2b2b3a" strokeWidth={2} fill="none" />
          <circle cx={42} cy={62} r={2.2} fill="#2b2b3a" />
        </g>
      );
    case "glasses":
      return (
        <g stroke={INK} strokeWidth={2} fill="#fff" fillOpacity={0.14}>
          <circle cx={42} cy={47} r={6} />
          <circle cx={58} cy={47} r={6} />
          <path d="M48 46.5 L52 46.5" fill="none" />
        </g>
      );
    case "goggles":
      return (
        <g>
          <rect x={27} y={28.5} width={46} height={5} rx={2} fill="#3a2f24" />
          <circle cx={41.5} cy={31} r={6.5} fill="#7dd3fc" stroke="#92400e" strokeWidth={2.2} />
          <circle cx={58.5} cy={31} r={6.5} fill="#7dd3fc" stroke="#92400e" strokeWidth={2.2} />
          <circle cx={39.5} cy={29} r={1.6} fill="#fff" opacity={0.8} />
          <circle cx={56.5} cy={29} r={1.6} fill="#fff" opacity={0.8} />
        </g>
      );
    case "crown":
      return (
        <g className="av-float">
          <path d="M36 23 L38 10 L44 17 L50 7 L56 17 L62 10 L64 23 Z" fill="#fbbf24" stroke="#b45309" strokeWidth={1} strokeLinejoin="round" />
          <circle cx={50} cy={18} r={1.8} fill="#e64980" />
          <circle cx={42} cy={19.5} r={1.3} fill="#22d3ee" />
          <circle cx={58} cy={19.5} r={1.3} fill="#22d3ee" />
        </g>
      );
    case "horns":
      return (
        <g fill="#efe6d6" stroke="#9c8f7a" strokeWidth={1}>
          <path d="M34 29 C26 23 24 14 27 7 C30 16 35 20 40 24 Z" />
          <path d="M66 29 C74 23 76 14 73 7 C70 16 65 20 60 24 Z" />
        </g>
      );
    case "catears": {
      const fur = a.hair === "none" || a.hair === "hood" ? a.outfit : a.hairColor;
      return (
        <g>
          <path d="M29 32 L31 11 L45 22 Z" fill={fur} />
          <path d="M71 32 L69 11 L55 22 Z" fill={fur} />
          <path d="M32.5 27 L33.5 17 L40.5 22.5 Z" fill="#f9a8c9" />
          <path d="M67.5 27 L66.5 17 L59.5 22.5 Z" fill="#f9a8c9" />
        </g>
      );
    }
    case "eyepatch":
      return (
        <g>
          <path d="M27 39 L73 53" stroke="#111" strokeWidth={2} />
          <ellipse cx={58} cy={47} rx={6.4} ry={5.8} fill="#111" />
        </g>
      );
    default:
      return null;
  }
}

export function AvatarArt({ config, title }: { config: AvatarConfig; title?: string }) {
  const a = config;
  const skinShadow = shade(a.skin, 0.84);
  const headDy = a.head === "long" ? -3 : 0;
  return (
    <svg viewBox="0 0 100 100" className="av block h-full w-full" role="img" aria-label={title ?? "Avatar"}>
      <rect width={100} height={100} fill={a.bg} />
      <Pattern kind={a.pattern} />
      <g className="av-body">
        <HairBack a={a} />
        <rect x={44} y={60} width={12} height={16} rx={3} fill={skinShadow} />
        <path d="M15 100 C15 82 30 74 50 74 C70 74 85 82 85 100 Z" fill={a.outfit} />
        <path d="M42 74.5 L50 84 L58 74.5" stroke={shade(a.outfit, 0.7)} strokeWidth={3} fill="none" strokeLinejoin="round" />
        <circle cx={a.head === "long" ? 31 : 29} cy={48} r={5} fill={skinShadow} />
        <circle cx={a.head === "long" ? 69 : 71} cy={48} r={5} fill={skinShadow} />
        {a.head === "round" && <ellipse cx={50} cy={46} rx={21} ry={23} fill={a.skin} />}
        {a.head === "square" && <rect x={29} y={24} width={42} height={44} rx={14} fill={a.skin} />}
        {a.head === "long" && <ellipse cx={50} cy={46} rx={19} ry={26} fill={a.skin} />}
        {a.blush && (
          <g fill="#ff6b8b" opacity={0.35}>
            <ellipse cx={37} cy={54} rx={3.6} ry={2.1} />
            <ellipse cx={63} cy={54} rx={3.6} ry={2.1} />
          </g>
        )}
        <Eyes kind={a.eyes} />
        <Mouth kind={a.mouth} />
        <FacialHair a={a} />
        <g transform={`translate(0 ${headDy})`}>
          <HairFront a={a} />
          <Accessory a={a} />
        </g>
      </g>
    </svg>
  );
}
