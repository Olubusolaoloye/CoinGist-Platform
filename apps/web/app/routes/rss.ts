import { data } from "react-router";
import type { Route } from "./+types/rss";
import { rssFeed, xmlResponse, type FeedScope } from "~/lib/feeds.server";

const SECTIONS = ["news", "gist", "learn"] as const;

/** /rss.xml, /news/rss.xml, /gist/rss.xml, /learn/rss.xml, /africa/rss.xml, /category/:slug/rss.xml */
export async function loader({ request, params }: Route.LoaderArgs) {
  const path = new URL(request.url).pathname;
  let scope: FeedScope;
  if (path === "/rss.xml") scope = { kind: "all" };
  else if (path === "/africa/rss.xml") scope = { kind: "category", slug: "africa" };
  else if (params.slug) scope = { kind: "category", slug: params.slug };
  else {
    const section = path.split("/")[1] as (typeof SECTIONS)[number];
    if (!SECTIONS.includes(section)) throw data(null, { status: 404 });
    scope = { kind: "section", type: section };
  }
  return xmlResponse(await rssFeed(scope), "application/rss+xml", 300);
}
