import { redirect } from "react-router";
import { assertSameOrigin } from "./csrf.server";
import { env } from "./env.server";
import { devSession } from "./session.server";
import { supabaseForRequest } from "./supabase.server";

export interface AuthResult {
  token: string;
  /** Set-Cookie headers (e.g. a refreshed session) to send back on the response. */
  headers: Headers;
}

/** Access token for this request, or null when signed out. */
export async function getAuth(request: Request): Promise<AuthResult | null> {
  if (env.authMode === "dev") {
    const session = await devSession.getSession(request.headers.get("cookie"));
    const token = session.get("accessToken");
    return token ? { token, headers: new Headers() } : null;
  }
  const { client, headers } = supabaseForRequest(request);
  // getSession reads (and refreshes if needed) the cookie session. The API verifies the
  // token's signature itself, so Studio doesn't trust it beyond forwarding it.
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  return token ? { token, headers } : null;
}

/** For every Studio loader/action: signed in, and same-origin for mutations. */
export async function requireAuth(request: Request): Promise<AuthResult> {
  assertSameOrigin(request);
  const auth = await getAuth(request);
  if (!auth) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return auth;
}

export async function signOutHeaders(request: Request): Promise<Headers> {
  if (env.authMode === "dev") {
    const session = await devSession.getSession(request.headers.get("cookie"));
    return new Headers({ "Set-Cookie": await devSession.destroySession(session) });
  }
  const { client, headers } = supabaseForRequest(request);
  await client.auth.signOut();
  return headers;
}

/** Only allow redirects to Studio paths (no open redirects via ?next=). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
