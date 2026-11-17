import { pagesSitemap, xmlResponse } from "~/lib/feeds.server";

export async function loader() {
  return xmlResponse(await pagesSitemap(), "application/xml", 300);
}
