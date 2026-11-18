import { serve } from "@hono/node-server";
import { createPgRepositories } from "@coingist/db";
import { createPgDatabase } from "@coingist/db/pg";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";
import { loadEnv } from "./env.js";
import { newsletterProviderFromEnv } from "./newsletter/from-env.js";
import { aiDepsFromEnv } from "./ai/from-env.js";

const env = loadEnv();
const db = createPgDatabase(env.DATABASE_URL);

const app = createApp({
  repos: createPgRepositories(db),
  verifyToken: createTokenVerifier({
    supabaseUrl: env.SUPABASE_URL,
    jwtSecret: env.SUPABASE_JWT_SECRET,
  }),
  corsOrigins: env.CORS_ORIGINS,
  newsletter: newsletterProviderFromEnv(env),
  newsletterWebhookSecret: env.BEEHIIV_WEBHOOK_SECRET,
  ai: aiDepsFromEnv(env),
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
