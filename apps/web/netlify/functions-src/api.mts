/**
 * DEMO API for the Netlify preview, served at /api/* (rewrite in netlify.toml).
 * See app/lib/demo-api.server.ts. Pre-bundled with esbuild (`pnpm build:functions`).
 */
import { demoApiFetch } from "../../app/lib/demo-api.server";

export default async (req: Request) => {
  // Requests arrive as /api/... or /.netlify/functions/api/...; the API's routes start at /v1.
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/, "") || "/";
  return demoApiFetch(new Request(url, req));
};
