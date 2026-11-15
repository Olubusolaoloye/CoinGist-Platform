import { data } from "react-router";
import { env } from "./env.server";

/** Host patterns from STUDIO_ALLOWED_ACTION_ORIGINS ("*" = one label, "**" = any number). */
const extraHosts = (process.env["STUDIO_ALLOWED_ACTION_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function hostMatches(host: string, pattern: string): boolean {
  if (pattern === "**") return true;
  const re = new RegExp(
    `^${pattern
      .split(".")
      .map((label) => (label === "**" ? ".+" : label === "*" ? "[^.]+" : label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("\\.")}$`,
    "i",
  );
  return re.test(host);
}

/**
 * CSRF defence for cookie-authenticated form posts. Cookies are SameSite=Lax; this also
 * rejects any mutation whose Origin host isn't Studio's own (as the browser addressed it,
 * so proxies that set X-Forwarded-Host work) or an explicitly allowed host.
 */
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  const ownHosts = [
    new URL(env.studioUrl).host,
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ].filter((h): h is string => !!h);
  const ok =
    originHost !== null &&
    (ownHosts.some((h) => h.toLowerCase() === originHost!.toLowerCase()) ||
      extraHosts.some((p) => hostMatches(originHost!, p)));
  if (!ok) throw data({ error: "Cross-site request blocked." }, { status: 403 });
}
