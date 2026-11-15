import { data } from "react-router";
import { env } from "./env.server";

/**
 * CSRF defence for cookie-authenticated form posts. Cookies are SameSite=Lax (blocks most
 * cross-site POSTs); this also rejects any mutating request whose Origin isn't Studio's.
 */
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const allowed = new Set([env.studioUrl, new URL(request.url).origin]);
  if (!origin || !allowed.has(origin)) {
    throw data({ error: "Cross-site request blocked." }, { status: 403 });
  }
}
