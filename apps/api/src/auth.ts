import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { SessionClaims } from "@coingist/db";

/** Verifies a Supabase access token. Returns null for any invalid/expired token. */
export type TokenVerifier = (token: string) => Promise<SessionClaims | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toClaims(payload: JWTPayload): SessionClaims | null {
  if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) return null;
  if (payload["role"] !== "authenticated") return null;
  const aal = payload["aal"] === "aal2" ? "aal2" : "aal1";
  const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
  return { sub: payload.sub, email, aal };
}

export function createTokenVerifier(opts: {
  supabaseUrl: string;
  /** HS256 shared secret (legacy Supabase projects). Omit to use asymmetric keys via JWKS. */
  jwtSecret?: string | undefined;
}): TokenVerifier {
  const issuer = `${opts.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const key = opts.jwtSecret
    ? new TextEncoder().encode(opts.jwtSecret)
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], {
        issuer,
        audience: "authenticated",
        algorithms: opts.jwtSecret ? ["HS256"] : ["RS256", "ES256"],
      });
      return toClaims(payload);
    } catch {
      return null;
    }
  };
}
