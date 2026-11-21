/**
 * The production API (apps/api) as a Netlify function, served at /api/* on the Studio site
 * (rewrite in netlify.toml). Talks to Supabase Postgres through DATABASE_URL.
 * Pre-bundled with esbuild (`pnpm build:functions`).
 */
import { loadEnv } from "@coingist/api/env";
import { initMonitoring } from "@coingist/api/monitoring";
import { createProductionApi } from "@coingist/api/server";

// Netlify doesn't set NODE_ENV for functions; production rules (no dev sign-in, no offline AI) must apply.
process.env["NODE_ENV"] = "production";

let api: ReturnType<typeof createProductionApi> | undefined;

export default async (req: Request) => {
  if (!api) {
    initMonitoring("api");
    // One connection per function instance; Supabase's pooler handles the rest.
    api = createProductionApi(loadEnv(), { poolSize: 1 });
  }
  // Requests arrive as /api/... or /.netlify/functions/api/...; the API's routes start at /v1.
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/, "") || "/";
  return api.app.fetch(new Request(url, req));
};
