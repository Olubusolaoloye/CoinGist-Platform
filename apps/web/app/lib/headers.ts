import type { HeadersFunction } from "react-router";

/**
 * Use the leaf loader's Cache-Control (set by `cached()`). Error responses are forced to
 * no-store in entry.server.tsx.
 */
export const passLoaderHeaders: HeadersFunction = ({ loaderHeaders }) => {
  const headers = new Headers();
  const cc = loaderHeaders.get("Cache-Control");
  if (cc) headers.set("Cache-Control", cc);
  return headers;
};
