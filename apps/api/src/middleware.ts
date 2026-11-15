import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { can, isStaff, type Permission } from "@coingist/types";
import type { TokenVerifier } from "./auth.js";
import type { AppEnv } from "./context.js";

const error = (
  status: 401 | 403 | 429,
  code: string,
  message: string,
  headers?: Record<string, string>,
) =>
  new HTTPException(status, {
    res: Response.json({ error: { code, message } }, { status, ...(headers ? { headers } : {}) }),
  });

/**
 * Runs on every request: verifies the bearer token (if any) and loads the caller's
 * current role/status from the database.
 */
export function authenticate(verify: TokenVerifier) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set("claims", null);
    c.set("user", null);

    const header = c.req.header("authorization");
    if (header) {
      const match = /^Bearer (.+)$/i.exec(header);
      const claims = match ? await verify(match[1]!) : null;
      if (!claims) throw error(401, "invalid_token", "Invalid or expired access token");
      const user = await c.var.repos.users.findById(claims.sub);
      if (!user) throw error(401, "invalid_token", "Unknown user");
      c.set("claims", claims);
      c.set("user", user);
    }
    await next();
  });
}

/** Requires a signed-in, active user. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) throw error(401, "unauthenticated", "Sign in required");
  if (user.status !== "active") throw error(403, "account_inactive", "Account is not active");
  await next();
});

/**
 * Requires a permission. Staff permissions also require an MFA-verified (aal2) session.
 * Always use this (not UI checks) to protect routes.
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user) throw error(401, "unauthenticated", "Sign in required");
    if (user.status !== "active") throw error(403, "account_inactive", "Account is not active");
    if (!can(user.role, permission)) throw error(403, "forbidden", "Not allowed");
    if (isStaff(user.role) && c.var.claims?.aal !== "aal2") {
      throw error(403, "mfa_required", "Two-factor verification required");
    }
    await next();
  });
}

export function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Fixed-window counters. Per-instance only: Cloudflare rate limiting sits in front in production. */
function windowCounter(opts: { windowMs: number; now: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    peek(key: string) {
      const e = hits.get(key);
      return e && e.resetAt > opts.now() ? e : { count: 0, resetAt: opts.now() + opts.windowMs };
    },
    hit(key: string) {
      const t = opts.now();
      let e = hits.get(key);
      if (!e || e.resetAt <= t) {
        e = { count: 0, resetAt: t + opts.windowMs };
        hits.set(key, e);
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
      e.count += 1;
      return e;
    },
  };
}

const tooMany = (resetAt: number, now: number, max: number) =>
  error(429, "rate_limited", "Too many requests", {
    "RateLimit-Limit": String(max),
    "RateLimit-Remaining": "0",
    "Retry-After": String(Math.max(1, Math.ceil((resetAt - now) / 1000))),
  });

/**
 * Per-IP limit on failed authentication. Runs before token checks and counts only 401s, so
 * bad-token floods are throttled while busy servers that call on behalf of many signed-in
 * users (Studio, the web SSR server) are never limited by their shared IP.
 */
export function authFailureLimit(opts: { windowMs: number; max: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const counter = windowCounter({ windowMs: opts.windowMs, now });
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = clientIp(c);
    const current = counter.peek(ip);
    if (current.count >= opts.max) throw tooMany(current.resetAt, now(), opts.max);
    await next();
    if (c.res.status === 401) counter.hit(ip);
  });
}

/** Per-caller limit: by user id when signed in, by IP otherwise. Runs after authenticate(). */
export function rateLimit(opts: { windowMs: number; max: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const counter = windowCounter({ windowMs: opts.windowMs, now });
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.var.claims ? `user:${c.var.claims.sub}` : `ip:${clientIp(c)}`;
    const entry = counter.hit(key);
    if (entry.count > opts.max) throw tooMany(entry.resetAt, now(), opts.max);
    await next();
    c.header("RateLimit-Limit", String(opts.max));
    c.header("RateLimit-Remaining", String(Math.max(0, opts.max - entry.count)));
  });
}
