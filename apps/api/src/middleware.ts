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

/**
 * Fixed-window, in-memory rate limiter keyed by client IP. Runs before token verification so
 * invalid-token floods are throttled too. Per-instance only: put Cloudflare rate limiting in
 * front in production and swap this for a shared store if the API scales out.
 */
export function rateLimit(opts: { windowMs: number; max: number; now?: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const now = opts.now ?? Date.now;

  return createMiddleware<AppEnv>(async (c, next) => {
    const t = now();
    const key =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + opts.windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
    }
    entry.count += 1;

    const limitHeaders = {
      "RateLimit-Limit": String(opts.max),
      "RateLimit-Remaining": String(Math.max(0, opts.max - entry.count)),
    };
    if (entry.count > opts.max) {
      throw error(429, "rate_limited", "Too many requests", {
        ...limitHeaders,
        "Retry-After": String(Math.ceil((entry.resetAt - t) / 1000)),
      });
    }
    await next();
    for (const [k, v] of Object.entries(limitHeaders)) c.header(k, v);
  });
}
