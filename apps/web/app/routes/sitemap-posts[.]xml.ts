import { postsSitemap, xmlResponse } from "~/lib/feeds.server";

export async function loader() {
  return xmlResponse(await postsSitemap(), "application/xml", 300);
}
