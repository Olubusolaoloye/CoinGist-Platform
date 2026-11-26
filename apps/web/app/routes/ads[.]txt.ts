import { adsenseConfig } from "~/lib/config.server";

/**
 * /ads.txt: tells ad buyers that Google may sell CoinGist's ad space (required by AdSense).
 * Empty until ADSENSE_CLIENT is set, so no seller is authorised by accident.
 */
export function loader() {
  const ads = adsenseConfig();
  const body = ads ? `google.com, ${ads.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, {
    status: ads ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
