/**
 * DEMO ONLY: the real CoinGist API on an in-memory Postgres seeded with fictional sample content.
 * Used by preview deploys (DEMO_INPROCESS_API=true) and the /api Netlify function.
 * One database per server instance; nothing persists. Replace with the real API + Supabase.
 */
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { createApp } from "@coingist/api/app";
import { createTokenVerifier } from "@coingist/api/auth";
import { createDevNewsletterProvider } from "@coingist/api/newsletter/dev-provider";
import { createPgRepositories } from "@coingist/db";
import { seedDevData } from "@coingist/db/dev-seed";
import { MIGRATIONS, SHIM_SQL } from "@coingist/db/dev-sql";
import { createPgliteDatabase } from "@coingist/db/pglite";

type App = ReturnType<typeof createApp>;
type Demo = { app: App; createReader: () => Promise<string> };
let ready: Promise<Demo> | null = null;

const ISSUER = "https://demo.invalid";

async function init(): Promise<Demo> {
  const { pg, db } = await createPgliteDatabase({ sql: { shim: SHIM_SQL, migrations: MIGRATIONS } });
  await seedDevData(pg);
  // A per-instance secret that never leaves this process. The only tokens it ever signs are
  // for brand-new reader accounts (below), so the demo can't be used to act as staff.
  const secret = randomBytes(32);
  const app = createApp({
    repos: createPgRepositories(db),
    verifyToken: createTokenVerifier({ supabaseUrl: ISSUER, jwtSecret: secret.toString("hex") }),
    corsOrigins: [],
    newsletter: createDevNewsletterProvider(),
  });
  const createReader = async () => {
    const email = `reader-${randomBytes(6).toString("hex")}@demo.invalid`;
    const res = await pg.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify({ full_name: "Demo reader" })],
    );
    return new SignJWT({ role: "authenticated", aal: "aal1", email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(res.rows[0]!.id)
      .setAudience("authenticated")
      .setIssuer(`${ISSUER}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(secret.toString("hex")));
  };
  return { app, createReader };
}

function demo(): Promise<Demo> {
  ready ??= init().catch((err) => {
    ready = null; // retry on the next request
    throw err;
  });
  return ready;
}

/** A fresh, empty reader account in the sample database; returns its access token. */
export async function createDemoReader(): Promise<string> {
  return (await demo()).createReader();
}

/** Handle an API request in-process (paths start at /v1). */
export async function demoApiFetch(request: Request): Promise<Response> {
  return (await demo()).app.fetch(request);
}
