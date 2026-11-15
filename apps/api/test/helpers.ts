import { SignJWT } from "jose";
import { createPgRepositories } from "@coingist/db";
import { createTestDb, type TestDb, type TestUser } from "@coingist/db/testing";
import { createApp } from "../src/app.js";
import { createTokenVerifier } from "../src/auth.js";

export const SUPABASE_URL = "http://supabase.test";
export const JWT_SECRET = "test-secret-test-secret-test-secret-123";
export const ORIGIN = "http://studio.test";

export async function setup(opts: { rateLimit?: { windowMs: number; max: number } } = {}) {
  const t = await createTestDb();
  const app = createApp({
    repos: createPgRepositories(t.db),
    verifyToken: createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: JWT_SECRET }),
    corsOrigins: [ORIGIN],
    ...opts,
  });
  return { t, app };
}

export async function tokenFor(
  user: Pick<TestUser, "id" | "email">,
  opts: { aal?: "aal1" | "aal2"; expiresIn?: string; secret?: string; issuer?: string } = {},
) {
  return new SignJWT({ role: "authenticated", aal: opts.aal ?? "aal2", email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("authenticated")
    .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export type { TestDb, TestUser };
