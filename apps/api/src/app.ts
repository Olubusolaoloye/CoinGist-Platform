import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { DomainError, type Repositories } from "@coingist/db";
import type { TokenVerifier } from "./auth.js";
import type { NewsletterProvider } from "./newsletter/provider.js";
import type { AppEnv } from "./context.js";
import { authenticate, authFailureLimit, rateLimit, requirePermission } from "./middleware.js";
import { adminRoutes } from "./routes/admin.js";
import { aiRoutes, type AiDeps } from "./routes/ai.js";
import { commerceRoutes, publicAdRoutes } from "./routes/commerce.js";
import { meRoutes } from "./routes/me.js";
import { newsletterAdminRoutes, newsletterPublicRoutes, newsletterWebhookRoutes } from "./routes/newsletter.js";
import { publicRoutes } from "./routes/public.js";
import { studioRoutes } from "./routes/studio.js";

export interface AppDeps {
  repos: Repositories;
  verifyToken: TokenVerifier;
  corsOrigins: string[];
  rateLimit?: { windowMs: number; max: number };
  newsletter: NewsletterProvider;
  /** Svix signing secret for newsletter webhooks (whsec_...). */
  newsletterWebhookSecret?: string | undefined;
  /** AI assist. Leave out to switch it off (Studio then says it isn't set up). */
  ai?: AiDeps | undefined;
}

const DOMAIN_STATUS = { forbidden: 403, not_found: 404, conflict: 409, invalid: 422 } as const;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  // Reject oversized bodies before parsing (stories are capped at ~400 KB of JSON).
  app.use("/v1/*", bodyLimit({ maxSize: 512 * 1024 }));

  // Auth is bearer-token only (no cookies), so CSRF does not apply to this API.
  // Revisit if cookie sessions are ever accepted here.
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    }),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (deps.corsOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PATCH", "DELETE"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use("*", async (c, next) => {
    c.set("repos", deps.repos);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Public reads are exempt from in-process limits: the web SSR server calls them from one IP,
  // and they are cached at the CDN. Cloudflare rules protect them in production.
  const limits = deps.rateLimit ?? { windowMs: 60_000, max: 120 };
  const failures = authFailureLimit(limits);
  const perCaller = rateLimit({ ...limits, max: limits.max * 3 });
  const unlessPublic =
    (mw: typeof failures): typeof failures =>
    (c, next) =>
      c.req.path.startsWith("/v1/public/") ? next() : mw(c, next);
  app.use("/v1/*", unlessPublic(failures));
  app.use("/v1/*", authenticate(deps.verifyToken));
  app.use("/v1/*", unlessPublic(perCaller));
  app.route("/v1/public", publicRoutes);
  app.route("/v1/public/ads", publicAdRoutes);
  app.route("/v1/public/newsletter", newsletterPublicRoutes(deps.newsletter));
  app.route("/v1/webhooks", newsletterWebhookRoutes(deps.newsletterWebhookSecret));
  app.route("/v1/admin/subscribers", newsletterAdminRoutes(deps.newsletter));
  app.route("/v1/me", meRoutes);
  app.route("/v1/admin", adminRoutes);
  if (deps.ai) app.route("/v1/studio/ai", aiRoutes(deps.ai));
  else {
    app.get("/v1/studio/ai/status", requirePermission("ai:use"), (c) => c.json({ provider: null, model: null, quota: null }));
    app.all("/v1/studio/ai/*", requirePermission("ai:use"), (c) =>
      c.json({ error: { code: "ai_off", message: "AI assist isn't set up on this server. Ask an admin to add an Anthropic API key." } }, 503),
    );
  }
  app.route("/v1/studio", studioRoutes);
  app.route("/v1/studio", commerceRoutes);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof DomainError) {
      return c.json({ error: { code: err.kind, message: err.message } }, DOMAIN_STATUS[err.kind]);
    }
    console.error(err); // TODO(step 5): report to Sentry
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
