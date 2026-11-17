import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDevData } from "@coingist/db/dev-seed";
import type { App } from "../src/app.js";
import { setup, type TestDb } from "./helpers.js";

let t: TestDb;
let app: App;

beforeAll(async () => {
  ({ t, app } = await setup({ rateLimit: { windowMs: 60_000, max: 1 } }));
  await seedDevData(t.pg);
});
afterAll(() => t.close());

describe("public content API", () => {
  it("lists published posts with CDN cache headers", async () => {
    const res = await app.request("/v1/public/posts?type=news&pageSize=3");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const body = (await res.json()) as { items: Array<{ type: string }>; total: number };
    expect(body.items).toHaveLength(3);
    expect(body.items.every((p) => p.type === "news")).toBe(true);
  });

  it("returns 404 for drafts and unknown slugs, without caching", async () => {
    for (const slug of ["unpublished-draft-never-visible", "nope"]) {
      const res = await app.request(`/v1/public/posts/${slug}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBeNull();
    }
  });

  it("validates slugs and query params", async () => {
    expect((await app.request("/v1/public/posts/Bad%20Slug")).status).toBe(400);
    expect((await app.request("/v1/public/posts?pageSize=500")).status).toBe(400);
    expect((await app.request("/v1/public/posts?type=secret")).status).toBe(400);
  });

  it("serves categories, tags and authors", async () => {
    expect((await app.request("/v1/public/categories")).status).toBe(200);
    expect((await app.request("/v1/public/categories/africa")).status).toBe(200);
    expect((await app.request("/v1/public/tags/p2p")).status).toBe(200);
    const author = await app.request("/v1/public/authors/amara-okafor");
    expect(await author.json()).toMatchObject({ author: { name: "Amara Okafor" } });
    expect((await app.request("/v1/public/authors/ghost")).status).toBe(404);
  });

  it("serves sitemap data, cached", async () => {
    const res = await app.request("/v1/public/sitemap");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const body = (await res.json()) as { posts: unknown[]; categories: unknown[] };
    expect(body.posts.length).toBe(13);
    expect(body.categories.length).toBe(7);
  });

  it("is not throttled by the per-IP limiter (SSR calls come from one IP)", async () => {
    const headers = { "x-forwarded-for": "10.0.0.1" };
    for (let i = 0; i < 5; i++) {
      expect((await app.request("/v1/public/categories", { headers })).status).toBe(200);
    }
    // Authenticated routes are still limited (max: 1 in this suite).
    await app.request("/v1/me", { headers });
    expect((await app.request("/v1/me", { headers })).status).toBe(429);
  });
});
