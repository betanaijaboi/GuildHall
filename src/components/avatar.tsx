/* eslint-disable @next/next/no-img-element */
export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
