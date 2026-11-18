import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  AiClaimsSchema,
  AiDraftSchema,
  AiGistSchema,
  AiOutlineSchema,
  AiRepurposeSchema,
  AiSeoSchema,
  AiTrendingSchema,
  type AiFeature,
  type AiQuota,
  type StaffRole,
  type TrendingDigest,
} from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission, rateLimit } from "../middleware.js";
import { clean } from "../ai/clean.js";
import { fetchHeadlines } from "../ai/feeds.js";
import { AiDeclinedError, AiUnavailableError, type AiProvider, type AiTask, type AiTasks } from "../ai/provider.js";

export interface AiDeps {
  provider: AiProvider;
  /** Requests per person per UTC day. */
  dailyLimits: Record<StaffRole, number>;
  /** RSS/Atom feeds for the trending digest. */
  trendingFeeds: string[];
  siteUrl: string;
  fetchFeeds?: typeof fetchHeadlines;
}

export const DEFAULT_DAILY_LIMITS: Record<StaffRole, number> = { writer: 40, editor: 150, admin: 150 };

const Id = z.object({ id: z.string().uuid() });

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Studio AI assist. Suggestions only: nothing here writes to a story. */
export function aiRoutes(deps: AiDeps) {
  const fetchFeeds = deps.fetchFeeds ?? fetchHeadlines;
  // A burst limit on AI requests (on top of the daily one), so a stuck button can't drain the
  // day's quota. Reads (status, links, history) aren't limited here.
  const burst = rateLimit({ windowMs: 60_000, max: 12 });

  async function quota(c: Context<AppEnv>): Promise<AiQuota> {
    const day = startOfUtcDay();
    const limit = deps.dailyLimits[c.var.user!.role as StaffRole] ?? 0;
    const used = await c.var.repos.ai.countSince(c.var.claims!, day);
    return { limit, used, remaining: Math.max(0, limit - used), resetsAt: new Date(day.getTime() + 86_400_000).toISOString() };
  }

  /** Quota check -> provider -> usage log. Returns a JSON response. */
  async function run<K extends AiTask, R>(
    c: Context<AppEnv>,
    feature: AiFeature & K,
    postId: string | null,
    input: AiTasks[K]["input"],
    shape: (out: AiTasks[K]["output"]) => R,
  ) {
    if (postId) await c.var.repos.ai.assertCanUsePost(c.var.claims!, postId);
    const before = await quota(c);
    if (before.remaining <= 0) {
      return c.json(
        { error: { code: "ai_limit", message: `You've used today's ${before.limit} AI requests. The limit resets at midnight UTC.` } },
        429,
      );
    }
    let out;
    try {
      out = await deps.provider.run(feature, input);
    } catch (err) {
      if (err instanceof AiDeclinedError) return c.json({ error: { code: "ai_declined", message: err.message } }, 422);
      if (err instanceof AiUnavailableError) return c.json({ error: { code: "ai_unavailable", message: err.message } }, 503);
      throw err;
    }
    await c.var.repos.ai.record(c.var.claims!, {
      feature,
      postId,
      provider: deps.provider.name,
      model: out.model,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
    });
    const used = before.used + 1;
    return c.json({
      result: shape(out.output),
      provider: deps.provider.name,
      quota: { ...before, used, remaining: Math.max(0, before.limit - used) },
    });
  }

  return new Hono<AppEnv>()
    .use("*", async (c, next) => {
      await next();
      c.header("Cache-Control", "no-store");
    })
    .get("/status", requirePermission("ai:use"), async (c) =>
      c.json({ provider: deps.provider.name, model: deps.provider.model, quota: await quota(c) }),
    )
    .post("/outline", burst, requirePermission("ai:use"), zValidator("json", AiOutlineSchema), (c) => {
      const { postId, ...i } = c.req.valid("json");
      return run(c, "outline", postId, i, clean.outline);
    })
    .post("/draft", burst, requirePermission("ai:use"), zValidator("json", AiDraftSchema), (c) => {
      const { postId, ...i } = c.req.valid("json");
      return run(c, "draft", postId, i, clean.draft);
    })
    .post("/gist", burst, requirePermission("ai:use"), zValidator("json", AiGistSchema), (c) => {
      const { postId, ...i } = c.req.valid("json");
      return run(c, "gist", postId, i, clean.gist);
    })
    .post("/seo", burst, requirePermission("ai:use"), zValidator("json", AiSeoSchema), (c) => {
      const { postId, ...i } = c.req.valid("json");
      return run(c, "seo", postId, i, (o) => clean.seo(o, i.title));
    })
    .post("/claims", burst, requirePermission("ai:use"), zValidator("json", AiClaimsSchema), (c) => {
      const { postId, ...i } = c.req.valid("json");
      return run(c, "claims", postId, i, (o) => clean.claims(o, i.text));
    })
    .post("/repurpose", burst, requirePermission("ai:use"), zValidator("json", AiRepurposeSchema), async (c) => {
      const { postId, format, title, text } = c.req.valid("json");
      const post = await c.var.repos.studio.getPost(c.var.claims!, postId);
      if (!post) return c.json({ error: { code: "not_found", message: "Post not found" } }, 404);
      const url = `${deps.siteUrl}/${post.type}/${post.slug}`;
      return run(c, "repurpose", postId, { format, title, text, url }, (o) => ({ format, posts: clean.repurpose(o.posts, format) }));
    })
    // Everything the editor's AI panel needs, in one request.
    .get("/posts/:id/panel", requirePermission("ai:use"), zValidator("param", Id), async (c) => {
      const id = c.req.valid("param").id;
      await c.var.repos.ai.assertCanUsePost(c.var.claims!, id);
      const [q, links, usage] = await Promise.all([
        quota(c),
        c.var.repos.ai.internalLinks(c.var.claims!, id),
        c.var.repos.ai.postUsage(c.var.claims!, id),
      ]);
      return c.json({ status: { provider: deps.provider.name, model: deps.provider.model, quota: q }, links, usage });
    })
    .get("/posts/:id/links", requirePermission("ai:use"), zValidator("param", Id), async (c) => {
      const id = c.req.valid("param").id;
      await c.var.repos.ai.assertCanUsePost(c.var.claims!, id);
      return c.json({ links: await c.var.repos.ai.internalLinks(c.var.claims!, id) });
    })
    .get("/posts/:id/usage", requirePermission("ai:use"), zValidator("param", Id), async (c) => {
      const id = c.req.valid("param").id;
      await c.var.repos.ai.assertCanUsePost(c.var.claims!, id);
      return c.json({ usage: await c.var.repos.ai.postUsage(c.var.claims!, id) });
    })
    .post("/trending", burst, requirePermission("post:review"), zValidator("json", AiTrendingSchema), async (c) => {
      const { notes } = c.req.valid("json");
      const { headlines, failed } = await fetchFeeds(deps.trendingFeeds);
      if (!headlines.length && !notes) {
        return c.json(
          { error: { code: "invalid", message: deps.trendingFeeds.length ? "None of the news feeds could be read just now. Add some notes, or try again later." : "No news feeds are configured. Add notes about what you're seeing, or ask an admin to set TRENDING_FEEDS." } },
          422,
        );
      }
      const covered = await c.var.repos.ai.recentTitles(c.var.claims!, 14);
      const input = { headlines, covered, notes };
      return run(c, "trending", null, input, (o): TrendingDigest => ({
        topics: clean.trending(o, input),
        headlineCount: headlines.length,
        sources: [...new Set(headlines.map((h) => h.source))].concat(failed.map((f) => `${f} (unavailable)`)),
        generatedAt: new Date().toISOString(),
      }));
    });
}
