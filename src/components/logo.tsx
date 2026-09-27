/**
 * Guildhall mark: a crest (the hall) holding an arch that doubles as a "G", with a spark
 * above the doorway: the guild that forms inside. Gradient violet → cyan, amber spark.
 */
export function LogoMark({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={animated ? "logo-mark logo-animated" : "logo-mark"} aria-hidden>
      <defs>
        <linearGradient id="gh-crest" x1="6" y1="3" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="gh-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="gh-crest-clip">
          <path d="M24 3 L42 13 V30 C42 38 34 43 24 46 C14 43 6 38 6 30 V13 Z" />
        </clipPath>
      </defs>
      <path d="M24 3 L42 13 V30 C42 38 34 43 24 46 C14 43 6 38 6 30 V13 Z" fill="url(#gh-crest)" />
      <path d="M24 6.5 L39 14.8 V29.6 C39 36 32.5 40.3 24 42.8 C15.5 40.3 9 36 9 29.6 V14.8 Z" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1" />
      <g clipPath="url(#gh-crest-clip)">
        <rect className="logo-sheen" x="-30" y="0" width="22" height="48" fill="url(#gh-sheen)" transform="skewX(-18)" />
      </g>
      <path d="M30.4 22.6 A8.8 8.8 0 1 0 32.8 30 H25.6" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path className="logo-spark" d="M24 8.2 L25.2 11.3 L28.3 12.5 L25.2 13.7 L24 16.8 L22.8 13.7 L19.7 12.5 L22.8 11.3 Z" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="group inline-flex items-center gap-2">
      <LogoMark size={size} animated />
      <span className="font-display text-[1.15rem] font-bold tracking-tight">
        Guild<span className="text-gradient">hall</span>
      </span>
    </span>
  );
}
