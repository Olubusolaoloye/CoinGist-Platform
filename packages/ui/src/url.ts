/** Returns a safe href, or null. Allows http(s), mailto, and site-relative paths only. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return href;
  try {
    const u = new URL(href);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Safe image src: https or site-relative only (no data:, javascript:, http:). */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  try {
    const u = new URL(src);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function isExternal(href: string, siteOrigin?: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return false;
  if (href.startsWith("mailto:")) return false;
  return siteOrigin ? !href.startsWith(siteOrigin) : true;
}
