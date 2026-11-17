/**
 * DEMO ONLY: the real CoinGist API on an in-memory Postgres seeded with fictional sample content.
 * Used by preview deploys (DEMO_INPROCESS_API=true) and the /api Netlify function.
 * One database per server instance; nothing persists. Replace with the real API + Supabase.
 */
import { randomBytes } from "node:crypto";
import { createApp } from "@coingist/api/app";
import { createTokenVerifier } from "@coingist/api/auth";
import { createDevNewsletterProvider } from "@coingist/api/newsletter/dev-provider";
import { createPgRepositories } from "@coingist/db";
import { seedDevData } from "@coingist/db/dev-seed";
import { MIGRATIONS, SHIM_SQL } from "@coingist/db/dev-sql";
import { createPgliteDatabase } from "@coingist/db/pglite";

type App = ReturnType<typeof createApp>;
let ready: Promise<App> | null = null;

async function init(): Promise<App> {
  const { pg, db } = await createPgliteDatabase({ sql: { shim: SHIM_SQL, migrations: MIGRATIONS } });
  await seedDevData(pg);
  return createApp({
    repos: createPgRepositories(db),
    // No sign-in in the demo: a random secret nobody holds means every token is rejected.
    verifyToken: createTokenVerifier({ supabaseUrl: "https://demo.invalid", jwtSecret: randomBytes(32).toString("hex") }),
    corsOrigins: [],
    newsletter: createDevNewsletterProvider(),
  });
}

/** Handle an API request in-process (paths start at /v1). */
export async function demoApiFetch(request: Request): Promise<Response> {
  ready ??= init().catch((err) => {
    ready = null; // retry on the next request
    throw err;
  });
  return (await ready).fetch(request);
}
