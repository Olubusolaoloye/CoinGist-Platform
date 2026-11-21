import { absoluteUrl } from "@coingist/seo";
import { searchIndexing, siteConfig } from "~/lib/config.server";

export function loader() {
  const site = siteConfig();
  // Demo deploys and the temporary netlify.app address: keep every crawler out.
  const body = !searchIndexing()
    ? "User-agent: *\nDisallow: /\n"
    : [
        "User-agent: *",
        "Allow: /",
        "Disallow: /resources/",
        "",
        `Sitemap: ${absoluteUrl(site, "/sitemap.xml")}`,
        `Sitemap: ${absoluteUrl(site, "/news-sitemap.xml")}`,
        "",
      ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
