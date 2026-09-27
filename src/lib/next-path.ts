/** A same-site path to return to after sign-in, or null. Rejects absolute and protocol-relative URLs. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}
