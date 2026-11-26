import { createPgRepositories } from "@coingist/db";
import { createPgDatabase } from "@coingist/db/pg";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";
import type { Env } from "./env.js";
import { newsletterProviderFromEnv } from "./newsletter/from-env.js";
import { aiDepsFromEnv } from "./ai/from-env.js";
import { cachedTicker, createCoinGeckoProvider, createSamplePriceProvider } from "./prices/provider.js";

/** The production API wired to Postgres. Shared by the Node server and serverless hosts. */
export function createProductionApi(env: Env, opts: { poolSize?: number } = {}) {
  const db = createPgDatabase(env.DATABASE_URL, { max: opts.poolSize });
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
  return { app, db };
}
