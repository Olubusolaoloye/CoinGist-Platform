import { newsSitemap, xmlResponse } from "~/lib/feeds.server";

export async function loader() {
  return xmlResponse(await newsSitemap(), "application/xml", 60);
}
