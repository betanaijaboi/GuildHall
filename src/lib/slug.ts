export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "project";
}

/** Handles are GitHub-compatible: letters, digits, single hyphens, max 39 chars. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(handle);
}
