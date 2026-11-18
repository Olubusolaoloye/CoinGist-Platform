/** Headers for personal pages and responses: never cached by a CDN, never indexed. */
export function privateHeaders(extra?: Headers): Headers {
  const h = new Headers(extra);
  h.set("Cache-Control", "private, no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  return h;
}
