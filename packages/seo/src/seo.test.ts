import { describe, expect, it } from "vitest";
import type { PostDetail } from "@coingist/types";
import { breadcrumbJsonLd, newsArticleJsonLd, profilePageJsonLd } from "./jsonld.js";
import { buildMeta, canonicalUrl, truncate, type MetaTag } from "./meta.js";
import { absoluteUrl, DEFAULT_SITE, type SiteConfig } from "./site.js";

const site: SiteConfig = { ...DEFAULT_SITE, url: "https://coingist.test", xHandle: "@coingist" };

const post: PostDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "news",
  slug: "btc-holds",
  title: "Bitcoin holds steady",
  excerpt: "Short excerpt.",
  heroImage: { url: "/img/btc.webp", alt: "Chart" },
  category: { slug: "bitcoin", name: "Bitcoin" },
  author: { slug: "amara-okafor", name: "Amara Okafor", avatarUrl: null },
  publishedAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  isSponsored: false,
  sponsorName: null,
  summaryBullets: [],
  body: { type: "doc", content: [] },
  tags: [{ slug: "markets", name: "Markets" }],
  seoTitle: null,
  seoDescription: null,
  canonical: null,
  aiAssisted: false,
  sponsor: null,
};

const find = (tags: MetaTag[], key: string, value: string) =>
  tags.find((t) => (t as Record<string, unknown>)[key] === value) as
    | Record<string, string>
    | undefined;

describe("urls", () => {
  it("makes absolute URLs and leaves absolute ones alone", () => {
    expect(absoluteUrl(site, "/news/x")).toBe("https://coingist.test/news/x");
    expect(absoluteUrl(site, "https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
  });

  it("strips query, hash and trailing slashes from canonicals", () => {
    expect(canonicalUrl(site, "/news/?page=2#top")).toBe("https://coingist.test/news");
    expect(canonicalUrl(site, "/")).toBe("https://coingist.test/");
  });
});

describe("truncate", () => {
  it("cuts on a word boundary and adds an ellipsis", () => {
    expect(truncate("one two three four five", 12)).toBe("one two…");
    expect(truncate("  short   text ", 50)).toBe("short text");
  });
});

describe("buildMeta", () => {
  const tags = buildMeta({
    site,
    path: "/news/btc-holds?utm_source=x",
    title: "Bitcoin holds steady",
    description: "Short description",
    type: "article",
    image: { url: "/img/btc.webp", alt: "Chart" },
    article: {
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      section: "Bitcoin",
      tags: ["Markets"],
    },
  });

  it("sets title with site name, description and canonical", () => {
    expect(tags[0]).toEqual({ title: "Bitcoin holds steady | CoinGist" });
    expect(find(tags, "rel", "canonical")?.["href"]).toBe("https://coingist.test/news/btc-holds");
  });

  it("emits Open Graph and X card tags with absolute image URLs", () => {
    expect(find(tags, "property", "og:type")?.["content"]).toBe("article");
    expect(find(tags, "property", "og:image")?.["content"]).toBe(
      "https://coingist.test/img/btc.webp",
    );
    expect(find(tags, "name", "twitter:card")?.["content"]).toBe("summary_large_image");
    expect(find(tags, "name", "twitter:site")?.["content"]).toBe("@coingist");
    expect(find(tags, "property", "article:tag")?.["content"]).toBe("Markets");
  });

  it("shortens long titles but always keeps the site name", () => {
    const t = buildMeta({
      site,
      path: "/x",
      title: "Stablecoin transfers climb as users look for cheaper remittances in West Africa",
      description: "d",
    });
    const title = (t[0] as { title: string }).title;
    expect(title.endsWith("… | CoinGist")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(70);
  });

  it("falls back to the default share image", () => {
    const t = buildMeta({ site, path: "/", title: "CoinGist", description: "d" });
    expect(t[0]).toEqual({ title: "CoinGist" });
    expect(find(t, "property", "og:image")?.["content"]).toBe("https://coingist.test/og-default.png");
  });

  it("supports noindex", () => {
    const t = buildMeta({ site, path: "/x", title: "x", description: "d", noindex: true });
    expect(find(t, "name", "robots")?.["content"]).toBe("noindex, follow");
  });
});

describe("JSON-LD", () => {
  it("builds a complete NewsArticle", () => {
    const ld = newsArticleJsonLd(site, post);
    expect(ld).toMatchObject({
      "@type": "NewsArticle",
      headline: "Bitcoin holds steady",
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      image: ["https://coingist.test/img/btc.webp"],
      author: [{ "@type": "Person", name: "Amara Okafor", url: "https://coingist.test/author/amara-okafor" }],
      publisher: { name: "CoinGist", logo: { url: "https://coingist.test/logo-512.png" } },
      url: "https://coingist.test/news/btc-holds",
    });
  });

  it("marks sponsored posts as advertiser content with the sponsor", () => {
    const ld = newsArticleJsonLd(site, { ...post, isSponsored: true, sponsor: { name: "ExamplePay", website: "https://example.com" } });
    expect(ld).toMatchObject({ "@type": "AdvertiserContentArticle", sponsor: { "@type": "Organization", name: "ExamplePay" } });
    expect(newsArticleJsonLd(site, post)["@type"]).toBe("NewsArticle");
  });

  it("uses the organisation as author when there is no byline", () => {
    const ld = newsArticleJsonLd(site, { ...post, author: null });
    expect(ld["author"]).toEqual([{ "@type": "Organization", name: "CoinGist", url: "https://coingist.test/" }]);
  });

  it("builds breadcrumbs and profile pages", () => {
    expect(
      breadcrumbJsonLd(site, [
        { name: "Home", path: "/" },
        { name: "News", path: "/news" },
      ]),
    ).toMatchObject({ itemListElement: [{ position: 1 }, { position: 2, item: "https://coingist.test/news" }] });
    const profile = profilePageJsonLd(site, {
      slug: "a",
      name: "A",
      avatarUrl: null,
      bio: null,
      socials: { x: "https://x.com/a", bad: "javascript:alert(1)" },
      expertise: [],
    });
    expect((profile["mainEntity"] as Record<string, unknown>)["sameAs"]).toEqual(["https://x.com/a"]);
  });
});
