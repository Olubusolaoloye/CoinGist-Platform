import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SubscribeInputSchema, SUBSCRIBER_STATUSES } from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission } from "../middleware.js";
import { parseNewsletterEvent, verifySvixSignature } from "../newsletter/webhook.js";
import type { NewsletterProvider } from "../newsletter/provider.js";
import { syncPending, syncSubscriber } from "../newsletter/sync.js";

/** Same answer whatever happened, so the form can't be used to find out who subscribes. */
const ACCEPTED = {
  ok: true,
  message: "Check your inbox to confirm your subscription.",
} as const;

export function newsletterPublicRoutes(provider: NewsletterProvider) {
  return new Hono<AppEnv>().post(
    "/subscribe",
    zValidator("json", SubscribeInputSchema, (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        return c.json({ error: { code: "invalid", message: issue?.message ?? "Check your details." } }, 400);
      }
    }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      const input = c.req.valid("json");
      // Honeypot filled in: a bot. Pretend it worked and do nothing.
      if (input.website) return c.json(ACCEPTED, 202);

      const { subscriber, needsSync } = await c.var.repos.newsletter.recordSignup({
        email: input.email,
        lists: input.lists,
        source: input.source,
      });
      // Failures are recorded and retried by the sync job; the reader still gets a success message.
      if (needsSync) await syncSubscriber(c.var.repos.newsletter, provider, subscriber);
      return c.json(ACCEPTED, 202);
    },
  );
}

/** Status changes from the newsletter tool (confirmations, unsubscribes, bounces). */
export function newsletterWebhookRoutes(secret: string | undefined) {
  return new Hono<AppEnv>().post("/newsletter", async (c) => {
    if (!secret) return c.json({ error: { code: "not_configured", message: "Webhook secret not set" } }, 503);
    const body = await c.req.text();
    const valid = verifySvixSignature({
      secret,
      id: c.req.header("svix-id"),
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature"),
      body,
    });
    if (!valid) return c.json({ error: { code: "invalid_signature", message: "Invalid signature" } }, 401);

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return c.json({ error: { code: "invalid", message: "Body is not JSON" } }, 400);
    }
    const event = parseNewsletterEvent(payload);
    // Unknown subscribers and ignored event types still get 2xx, so the sender doesn't retry forever.
    if (event) await c.var.repos.newsletter.applyProviderStatus(event, event.status);
    return c.body(null, 204);
  });
}

const ListQuery = z.object({
  status: z.enum(SUBSCRIBER_STATUSES).optional(),
  sync: z.enum(["pending", "synced", "failed"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function newsletterAdminRoutes(provider: NewsletterProvider) {
  return new Hono<AppEnv>()
    .use("*", async (c, next) => {
      await next();
      c.header("Cache-Control", "no-store");
    })
    .get("/", requirePermission("subscribers:manage"), zValidator("query", ListQuery), async (c) => {
      const q = c.req.valid("query");
      const list = await c.var.repos.newsletter.list(c.var.claims!, {
        status: q.status,
        syncStatus: q.sync,
        page: q.page,
        pageSize: q.pageSize,
      });
      return c.json(list);
    })
    .get("/stats", requirePermission("subscribers:manage"), async (c) =>
      c.json({ stats: await c.var.repos.newsletter.stats(c.var.claims!), provider: provider.name }),
    )
    .post("/retry-failed", requirePermission("subscribers:manage"), async (c) => {
      const requeued = await c.var.repos.newsletter.retryFailed(c.var.claims!);
      const result = await syncPending(c.var.repos.newsletter, provider);
      return c.json({ requeued, ...result });
    });
}
