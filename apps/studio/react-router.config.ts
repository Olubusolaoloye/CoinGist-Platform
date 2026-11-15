import type { Config } from "@react-router/dev/config";

/**
 * Extra hosts allowed to submit forms (React Router's built-in CSRF check), e.g. a preview proxy
 * or a staging domain. Comma-separated host patterns; "*" matches one label, "**" several.
 * Our own check in app/lib/csrf.server.ts uses the same list.
 */
const extraOrigins = (process.env["STUDIO_ALLOWED_ACTION_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// SSR is mandatory (see CLAUDE.md): every route renders on the server.
export default {
  ssr: true,
  ...(extraOrigins.length ? { allowedActionOrigins: extraOrigins } : {}),
} satisfies Config;
