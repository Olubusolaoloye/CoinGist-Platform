import { sitemapIndex, xmlResponse } from "~/lib/feeds.server";

export async function loader() {
  return xmlResponse(await sitemapIndex(), "application/xml", 300);
}
