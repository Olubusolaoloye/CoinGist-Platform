/**
 * Local API with no external services: in-memory Postgres (PGlite) + sample content.
 * Data resets on every start. Never run this in production.
 */
import { serve } from "@hono/node-server";
import { createPgRepositories } from "@coingist/db";
import { seedDevData } from "@coingist/db/dev-seed";
import { createPgliteDatabase } from "@coingist/db/pglite";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";

if (process.env["NODE_ENV"] === "production") {
  throw new Error("dev.ts must not run in production");
}

const port = Number(process.env["PORT"] ?? 8787);
const { pg, db } = await createPgliteDatabase();
await seedDevData(pg);

const app = createApp({
  repos: createPgRepositories(db),
  verifyToken: createTokenVerifier({
    supabaseUrl: "http://localhost:54321",
    jwtSecret: "local-dev-secret-not-for-production-use",
  }),
  corsOrigins: ["http://localhost:5173", "http://localhost:5174"],
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api (local, seeded PGlite) on http://localhost:${info.port}`);
});
