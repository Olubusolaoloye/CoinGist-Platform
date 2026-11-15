import { serve } from "@hono/node-server";
import { createPgDatabase, createPgRepositories } from "@coingist/db";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createPgDatabase(env.DATABASE_URL);

const app = createApp({
  repos: createPgRepositories(db),
  verifyToken: createTokenVerifier({
    supabaseUrl: env.SUPABASE_URL,
    jwtSecret: env.SUPABASE_JWT_SECRET,
  }),
  corsOrigins: env.CORS_ORIGINS,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
