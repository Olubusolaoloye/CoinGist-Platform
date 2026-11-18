import { serve } from "@hono/node-server";
import { createPgRepositories } from "@coingist/db";
import { createPgDatabase } from "@coingist/db/pg";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";
import { loadEnv } from "./env.js";
import { initMonitoring } from "./monitoring.js";
import { newsletterProviderFromEnv } from "./newsletter/from-env.js";
import { aiDepsFromEnv } from "./ai/from-env.js";
import { cachedTicker, createCoinGeckoProvider, createSamplePriceProvider } from "./prices/provider.js";

const env = loadEnv();
initMonitoring("api");
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
  prices:
    env.PRICES_PROVIDER === "off"
      ? undefined
      : cachedTicker(
          env.PRICES_PROVIDER === "sample"
            ? createSamplePriceProvider()
            : createCoinGeckoProvider({ apiKey: env.COINGECKO_API_KEY, baseUrl: env.COINGECKO_BASE_URL }),
        ),
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
