import type { HeadersFunction } from "react-router";

/**
 * Studio pages are private: never cached. Forward Set-Cookie from loaders/actions
 * (refreshed Supabase sessions) and from parent routes.
 */
export const studioHeaders: HeadersFunction = ({ loaderHeaders, actionHeaders, parentHeaders, errorHeaders }) => {
  const out = new Headers({ "Cache-Control": "no-store" });
  for (const h of [parentHeaders, loaderHeaders, actionHeaders, errorHeaders]) {
    if (!h) continue;
    for (const cookie of h.getSetCookie()) out.append("Set-Cookie", cookie);
  }
  return out;
};
