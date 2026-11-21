import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDevData } from "../dev/seed.js";
import { createContentRepository, type ContentRepository } from "../src/content.js";
import { createTestDb, type TestDb } from "./harness.js";

let t: TestDb;
let content: ContentRepository;

beforeAll(async () => {
  t = await createTestDb();
  await seedDevData(t.pg);
  content = createContentRepository(t.db);
});
afterAll(() => t.close());

describe("public content", () => {
  it("lists only published posts, newest first, with total", async () => {
    const res = await content.listPosts({ page: 1, pageSize: 50 });
    expect(res.total).toBe(13);
    expect(res.items.map((p) => p.slug)).not.toContain("unpublished-draft-never-visible");
    const times = res.items.map((p) => Date.parse(p.publishedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("paginates", async () => {
    const page2 = await content.listPosts({ page: 2, pageSize: 5 });
    expect(page2.items).toHaveLength(5);
    expect(page2.total).toBe(13);
  });

  it("filters by type, category, tag and author", async () => {
    const learn = await content.listPosts({ type: "learn", page: 1, pageSize: 50 });
    expect(learn.items.every((p) => p.type === "learn")).toBe(true);
    expect(learn.total).toBe(3);

    const africa = await content.listPosts({ categorySlug: "africa", page: 1, pageSize: 50 });
    expect(africa.items.every((p) => p.category?.slug === "africa")).toBe(true);

    const p2p = await content.listPosts({ tagSlug: "p2p", page: 1, pageSize: 50 });
    expect(p2p.items.map((p) => p.slug)).toEqual(["gist-p2p-trading-nigeria"]);

    const zanele = await content.listPosts({ authorSlug: "zanele-dube", page: 1, pageSize: 50 });
    expect(zanele.items.every((p) => p.author?.slug === "zanele-dube")).toBe(true);
  });

  it("returns full post detail with author, category, tags and sponsor", async () => {
    const post = await content.getPost("examplepay-cross-border-payments");
    expect(post).toMatchObject({
      type: "sponsored",
      isSponsored: true,
      sponsor: { name: "ExamplePay (fictional)", website: "https://example.com" },
      author: { slug: "kwame-mensah", name: "Kwame Mensah" },
      category: { slug: "stablecoins" },
      tags: [{ slug: "remittances", name: "Remittances" }],
    });
    expect(post!.body.type).toBe("doc");
  });

  it("returns null for drafts and unknown slugs", async () => {
    expect(await content.getPost("unpublished-draft-never-visible")).toBeNull();
    expect(await content.getPost("does-not-exist")).toBeNull();
  });

  it("exposes authors without private fields", async () => {
    const author = await content.getAuthor("tunde-bello");
    expect(author).toEqual({
      slug: "tunde-bello",
      name: "Tunde Bello",
      avatarUrl: null,
      title: null,
      bio: expect.any(String),
      socials: {},
      expertise: ["Regulation", "Policy"],
    });
  });

  it("only exposes sponsors attached to live content", async () => {
    await t.pg.query("insert into public.sponsors (name) values ('Hidden Prospect')");
    const rows = await t.db.asUser(null, (q) =>
      q.query<{ name: string }>("select name from public.sponsor_directory"),
    );
    expect(rows.map((r) => r.name)).toEqual(["ExamplePay (fictional)"]);
  });

  it("looks up categories and tags", async () => {
    expect((await content.listCategories()).map((c) => c.slug)).toContain("africa");
    expect(await content.getCategory("bitcoin")).toMatchObject({ name: "Bitcoin" });
    expect(await content.getTag("kenya")).toEqual({ slug: "kenya", name: "Kenya" });
    expect(await content.getCategory("nope")).toBeNull();
  });
});

describe("featured, search and read time", () => {
  it("lists editors' picks", async () => {
    const picks = await content.listPosts({ featured: true, page: 1, pageSize: 10 });
    expect(picks.items.map((p) => p.slug).sort()).toEqual([
      "gist-p2p-trading-nigeria", "kenya-mobile-money-crypto-builders", "regulators-draft-rules-exchanges",
      "set-up-self-custody-wallet", "what-is-a-stablecoin",
    ]);
  });

  it("searches titles, excerpts and body text, best match first", async () => {
    const res = await content.listPosts({ q: "stablecoin", page: 1, pageSize: 10 });
    expect(res.items[0]!.slug).toBe("what-is-a-stablecoin");
    expect(res.total).toBeGreaterThan(1);
    // Body text is searched too (every seed body mentions "takeaway").
    expect((await content.listPosts({ q: "takeaway", page: 1, pageSize: 50 })).total).toBe(13);
    // websearch syntax is safe with odd input.
    await expect(content.listPosts({ q: '"unbalanced -or OR & | !', page: 1, pageSize: 5 })).resolves.toBeDefined();
    expect((await content.listPosts({ q: "zzzznotaword", page: 1, pageSize: 5 })).total).toBe(0);
  });

  it("estimates read time from the body", async () => {
    const res = await content.listPosts({ page: 1, pageSize: 1 });
    expect(res.items[0]!.readMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("sitemap data", () => {
  it("lists every live post (no drafts) with tags, plus categories, authors and indexable tags", async () => {
    const data = await content.sitemap();
    expect(data.posts).toHaveLength(13);
    expect(data.posts.map((p) => p.slug)).not.toContain("unpublished-draft-never-visible");
    expect(data.posts.find((p) => p.slug === "gist-p2p-trading-nigeria")?.tags).toEqual(["Nigeria", "P2P"]);
    expect(data.posts.find((p) => p.type === "sponsored")?.isSponsored).toBe(true);
    expect(data.categories.find((c) => c.slug === "africa")?.lastPublishedAt).not.toBeNull();
    expect(data.authors.map((a) => a.slug)).toEqual(["amara-okafor", "kwame-mensah", "tunde-bello", "zanele-dube"]);
    // Only tags with at least 3 stories (seed: remittances has 3).
    expect(data.tags.map((t) => t.slug)).toEqual(["remittances"]);
  });
});

describe("seed", () => {
  it("backdates updated_at to the publish time", async () => {
    const res = await t.pg.query<{ n: number }>(
      "select count(*)::int n from public.posts where updated_at <> coalesce(published_at, created_at)",
    );
    expect(res.rows[0]!.n).toBe(0);
  });
});
