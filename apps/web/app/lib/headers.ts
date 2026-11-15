import type { HeadersFunction } from "react-router";

/**
 * Use the leaf loader's Cache-Control (set by `cached()`), or the action's after a form post.
 * Error responses are forced to no-store in entry.server.tsx.
 */
export const passLoaderHeaders: HeadersFunction = ({ loaderHeaders, actionHeaders }) => {
  const headers = new Headers();
  // A form submission's response must never be cached, whatever the page's loader says.
  const cc = actionHeaders.get("Cache-Control") ?? loaderHeaders.get("Cache-Control");
  if (cc) headers.set("Cache-Control", cc);
  return headers;
};
