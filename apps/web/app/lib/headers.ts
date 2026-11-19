import type { HeadersFunction } from "react-router";

const CDN = ["Netlify-CDN-Cache-Control", "Netlify-Vary"] as const;

/**
 * Use the leaf loader's caching headers (set by `cached()`), or the action's after a form post.
 * Error responses are forced to no-store in entry.server.tsx.
 */
export const passLoaderHeaders: HeadersFunction = ({ loaderHeaders, actionHeaders }) => {
  const headers = new Headers();
  // A form submission's response must never be cached, whatever the page's loader says.
  if (actionHeaders.has("Cache-Control")) {
    headers.set("Cache-Control", actionHeaders.get("Cache-Control")!);
    return headers;
  }
  const cc = loaderHeaders.get("Cache-Control");
  if (cc) headers.set("Cache-Control", cc);
  for (const h of CDN) {
    const v = loaderHeaders.get(h);
    if (v) headers.set(h, v);
  }
  return headers;
};
