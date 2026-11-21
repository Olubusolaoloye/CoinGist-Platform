import "./production.server";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createCookieSessionStorage, data, redirect } from "react-router";
import type { FeedStory, FollowInput, FollowTarget, Paginated, ReaderFeed, ReaderState, SavedStory, User, MyEngagement } from "@coingist/types";
import { apiUrl, isDemo, siteConfig } from "./config.server";

/**
 * Reader sign-in for the public site.
 *  - "supabase": magic link or Google (production).
 *  - "dev": pick a seeded account; tokens come from the local API (never in production).
 *  - "demo": preview deploys; each visitor gets a throwaway reader in the sample database.
 * Public pages never read these cookies, so they stay cacheable; only /account and /for-you do.
 */
export type ReaderAuthMode = "supabase" | "dev" | "demo" | "off";

const localApi = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiUrl());

export function readerAuthMode(): ReaderAuthMode {
  const explicit = process.env["READER_AUTH"];
  if (explicit === "supabase" || explicit === "dev" || explicit === "demo" || explicit === "off") return explicit;
  if (isDemo()) return "demo";
  if (process.env["NODE_ENV"] !== "production") return "dev";
  // Production without Supabase settings: reader accounts are simply unavailable.
  return process.env["SUPABASE_URL"] && process.env["SUPABASE_ANON_KEY"] ? "supabase" : "off";
}

/** Refuse unsafe combinations at startup (called from entry.server). */
export function assertReaderAuthConfig() {
  const mode = readerAuthMode();
  // Dev sign-in mints tokens from the local API's /dev endpoints; never against a real API.
  if (mode === "dev" && process.env["NODE_ENV"] === "production" && !localApi()) {
    throw new Error("READER_AUTH=dev is only allowed against a local API");
  }
  if (mode === "supabase" && (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_ANON_KEY"])) {
    throw new Error("Reader sign-in needs SUPABASE_URL and SUPABASE_ANON_KEY");
  }
  if (mode === "off") console.warn("Reader accounts are off: set SUPABASE_URL and SUPABASE_ANON_KEY to turn them on.");
}

const secure = () => process.env["NODE_ENV"] === "production";

/** dev/demo: the access token lives in a signed, HttpOnly cookie. */
const tokenSession = createCookieSessionStorage<{ accessToken: string }>({
  cookie: {
    name: "cg_reader",
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: 7 * 24 * 3600,
    secrets: [process.env["SESSION_SECRET"] || "dev-only-reader-session-secret-change-me"],
  },
});

/**
 * Not a secret: tells the page's JavaScript "this browser is signed in", so cached public pages
 * can show the account link and load the reader's button states afterwards.
 */
export const SIGNED_IN_HINT = "cg_signed_in";
const hint = (on: boolean) =>
  `${SIGNED_IN_HINT}=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${on ? 30 * 24 * 3600 : 0}${secure() ? "; Secure" : ""}`;

function supabaseFor(request: Request) {
  const headers = new Headers();
  const client = createServerClient(process.env["SUPABASE_URL"] ?? "", process.env["SUPABASE_ANON_KEY"] ?? "", {
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({ name: c.name, value: c.value ?? "" })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
      },
    },
    cookieOptions: { sameSite: "lax", secure: secure(), httpOnly: true, path: "/" },
  });
  return { client, headers };
}

export interface ReaderAuth {
  token: string;
  /** Cookies to send back (refreshed sessions). */
  headers: Headers;
}

export async function getReader(request: Request): Promise<ReaderAuth | null> {
  if (readerAuthMode() === "off") return null;
  if (readerAuthMode() !== "supabase") {
    const session = await tokenSession.getSession(request.headers.get("cookie"));
    const token = session.get("accessToken");
    return token ? { token, headers: new Headers() } : null;
  }
  const { client, headers } = supabaseFor(request);
  const { data: d } = await client.auth.getSession();
  return d.session ? { token: d.session.access_token, headers } : null;
}

/** Same-origin check for cookie-authenticated form posts (CSRF), on top of SameSite=Lax. */
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const allowed = new Set([host, new URL(siteConfig().url).host].filter(Boolean));
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || !allowed.has(originHost)) throw data({ error: "Cross-site request blocked" }, { status: 403 });
}

/** Only redirect within the site (no open redirects via ?next=). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/for-you";
}

export async function requireReader(request: Request): Promise<ReaderAuth> {
  assertSameOrigin(request);
  const auth = await getReader(request);
  if (!auth) {
    const url = new URL(request.url);
    throw redirect(`/account/login?next=${encodeURIComponent(url.pathname + url.search)}`, { headers: { "Set-Cookie": hint(false) } });
  }
  return auth;
}

/** Start a session from an access token (dev/demo). */
/**
 * Right after sign-in: a deactivated account comes back to life (a suspended one doesn't).
 * Returns where to send them: the welcome-back notice if it was deactivated, otherwise `next`.
 */
export async function afterSignIn(accessToken: string, next: string): Promise<string> {
  try {
    const res = await call({ token: accessToken, headers: new Headers() }, "POST", "/reactivate");
    if (res.ok && ((await res.json()) as { reactivated?: boolean }).reactivated) return "/account?welcome=back";
  } catch {
    // Never block sign-in on this.
  }
  return next;
}

export async function signInWithToken(accessToken: string, next: string) {
  next = await afterSignIn(accessToken, next);
  const session = await tokenSession.getSession();
  session.set("accessToken", accessToken);
  const headers = new Headers();
  headers.append("Set-Cookie", await tokenSession.commitSession(session));
  headers.append("Set-Cookie", hint(true));
  return redirect(next, { headers });
}

export function signedInHeaders(headers: Headers): Headers {
  headers.append("Set-Cookie", hint(true));
  return headers;
}

export async function signOut(request: Request): Promise<Headers> {
  const headers = new Headers();
  if (readerAuthMode() === "supabase") {
    const { client, headers: h } = supabaseFor(request);
    await client.auth.signOut();
    h.forEach((v, k) => headers.append(k, v));
  } else {
    const session = await tokenSession.getSession(request.headers.get("cookie"));
    headers.append("Set-Cookie", await tokenSession.destroySession(session));
  }
  headers.append("Set-Cookie", hint(false));
  return headers;
}

export { supabaseFor };

// ─── API calls as the reader ────────────────────────────────────────────────

async function call(auth: ReaderAuth, method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${auth.token}`,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  };
  if (process.env["DEMO_INPROCESS_API"] === "true") {
    const { demoApiFetch } = await import("./demo-api.server");
    return demoApiFetch(new Request(`http://demo.internal/v1/me${path}`, init));
  }
  return fetch(`${apiUrl()}/v1/me${path}`, init);
}

/** The session is no longer valid (expired, revoked, or a demo database that restarted). */
export class SignedOut extends Error {}

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new SignedOut();
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & T;
  // A deactivated (or suspended) account is treated as signed out on this browser.
  if (res.status === 403 && body.error?.code === "account_inactive") throw new SignedOut();
  if (!res.ok) throw data({ error: body.error?.message ?? "Something went wrong" }, { status: res.status === 404 ? 404 : res.status >= 500 ? 502 : res.status });
  return body;
}

export function readerApi(auth: ReaderAuth) {
  return {
    me: () => call(auth, "GET", "").then((r) => json<{ user: User }>(r)),
    state: (postId?: string) => call(auth, "GET", `/state${postId ? `?postId=${postId}` : ""}`).then((r) => json<ReaderState>(r)),
    feed: (page: number) => call(auth, "GET", `/feed?page=${page}&pageSize=20`).then((r) => json<ReaderFeed>(r)),
    bookmarks: (page: number) => call(auth, "GET", `/bookmarks?page=${page}&pageSize=20`).then((r) => json<Paginated<SavedStory>>(r)),
    save: (postId: string) => call(auth, "PUT", `/bookmarks/${postId}`).then((r) => json<void>(r)),
    unsave: (postId: string) => call(auth, "DELETE", `/bookmarks/${postId}`).then((r) => json<void>(r)),
    follows: () => call(auth, "GET", "/follows").then((r) => json<{ follows: FollowTarget[] }>(r)),
    follow: (f: FollowInput) => call(auth, "PUT", "/follows", f).then((r) => json<{ follow: FollowTarget }>(r)),
    unfollow: (f: FollowInput) => call(auth, "DELETE", `/follows/${f.type}/${encodeURIComponent(f.slug)}`).then((r) => json<void>(r)),
    deactivate: () => call(auth, "POST", "/deactivate").then((r) => json<void>(r)),
    myEngagement: (postId: string) => call(auth, "GET", `/posts/${postId}/engagement`).then((r) => json<MyEngagement>(r)),
    comment: (postId: string, body: string, parentId?: string) =>
      call(auth, "POST", `/posts/${postId}/comments`, parentId ? { body, parentId } : { body }).then((r) => json<{ id: string }>(r)),
    editComment: (id: string, body: string) => call(auth, "PATCH", `/comments/${id}`, { body }).then((r) => json<void>(r)),
    deleteComment: (id: string) => call(auth, "DELETE", `/comments/${id}`).then((r) => json<void>(r)),
    likePost: (postId: string, on: boolean) => call(auth, on ? "PUT" : "DELETE", `/posts/${postId}/like`).then((r) => json<{ likes: number }>(r)),
    likeComment: (id: string, on: boolean) => call(auth, on ? "PUT" : "DELETE", `/comments/${id}/like`).then((r) => json<{ likes: number }>(r)),
    report: (id: string, reason: string) => call(auth, "POST", `/comments/${id}/report`, { reason }).then((r) => json<void>(r)),
    setName: (name: string) => call(auth, "PATCH", "/profile", { name }).then((r) => json<void>(r)),
  };
}

/** Run reader API calls; an invalid session signs the browser out and sends them to sign in. */
export async function withReader<T>(request: Request, fn: (api: ReturnType<typeof readerApi>, auth: ReaderAuth) => Promise<T>): Promise<T> {
  const auth = await requireReader(request);
  try {
    return await fn(readerApi(auth), auth);
  } catch (err) {
    if (err instanceof SignedOut) {
      const url = new URL(request.url);
      const next = request.method === "GET" ? url.pathname + url.search : "/for-you";
      throw redirect(`/account/login?expired=1&next=${encodeURIComponent(next)}`, { headers: await signOut(request) });
    }
    throw err;
  }
}

export type { FeedStory };
