import { data, redirect } from "react-router";
import type { Route } from "./+types/go.ad";
import { api } from "~/lib/api.server";
import { allow, clientIp } from "~/lib/ratelimit.server";

/** Ad click: count it (throttled per visitor), then send the reader to the advertiser. */
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw data(null, { status: 404 });
  // Over the limit: still send them on, just don't count it.
  const counted = allow(`adclick:${clientIp(request)}:${params.id}`, 3, 60 * 60_000);
  const url = counted ? await api.recordAdClick(params.id) : null;
  if (url) {
    return redirect(url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "origin" } });
  }
  if (!counted) throw redirect("/", { headers: { "Cache-Control": "no-store" } });
  throw data(null, { status: 404 });
}
