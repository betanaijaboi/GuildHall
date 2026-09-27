/** Moodboards (C17): references for a project's look and feel, including pieces from people's portfolios. */

/** External images must be plain https links (no credentials, no data: or javascript: URLs). */
export function safeImageUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.href.length > 1000) return null;
  return u.href;
}

export const HEX = /^#[0-9a-f]{6}$/i;

export function normaliseHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, "#").toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX.test(v) ? v : null;
}

/** Readable text colour on a swatch (WCAG relative luminance). */
export function textOn(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#000000" : "#ffffff";
}
