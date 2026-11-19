import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PostTypeSchema, SlugSchema } from "@coingist/types";
import type { AppEnv } from "../context.js";

/** CDN-cacheable for a minute; serve stale for 5 while revalidating. */
const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
/** Netlify's shared cache: every edge node reads it, and stale copies are served while refreshing. */
const CDN_CACHE = "public, durable, s-maxage=60, stale-while-revalidate=604800";

const SlugParam = z.object({ slug: SlugSchema });
const ListQuery = z.object({
  type: PostTypeSchema.optional(),
  category: SlugSchema.optional(),
  tag: SlugSchema.optional(),
  author: SlugSchema.optional(),
  exclude: z.string().uuid().optional(),
  featured: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const notFound = { error: { code: "not_found", message: "Not found" } } as const;

export const publicRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status === 200) {
      c.header("Cache-Control", CACHE);
      c.header("Netlify-CDN-Cache-Control", CDN_CACHE);
    }
  })
  .get("/posts", zValidator("query", ListQuery), async (c) => {
    const q = c.req.valid("query");
    const res = await c.var.repos.content.listPosts({
      type: q.type,
      categorySlug: q.category,
      tagSlug: q.tag,
      authorSlug: q.author,
      excludeId: q.exclude,
      featured: q.featured === "true",
      q: q.q,
      page: q.page,
      pageSize: q.pageSize,
    });
    return c.json(res);
  })
  .get("/posts/:slug", zValidator("param", SlugParam), async (c) => {
    const post = await c.var.repos.content.getPost(c.req.valid("param").slug);
    return post ? c.json({ post }) : c.json(notFound, 404);
  })
  .get("/categories", async (c) => c.json({ categories: await c.var.repos.content.listCategories() }))
  .get("/categories/:slug", zValidator("param", SlugParam), async (c) => {
    const category = await c.var.repos.content.getCategory(c.req.valid("param").slug);
    return category ? c.json({ category }) : c.json(notFound, 404);
  })
  .get("/tags/:slug", zValidator("param", SlugParam), async (c) => {
    const tag = await c.var.repos.content.getTag(c.req.valid("param").slug);
    return tag ? c.json({ tag }) : c.json(notFound, 404);
  })
  .get("/sitemap", async (c) => c.json(await c.var.repos.content.sitemap()))
  .get("/authors/:slug", zValidator("param", SlugParam), async (c) => {
    const author = await c.var.repos.content.getAuthor(c.req.valid("param").slug);
    return author ? c.json({ author }) : c.json(notFound, 404);
  });
