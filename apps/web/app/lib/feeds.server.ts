import {
  absoluteUrl,
  newsSitemapXml,
  rssXml,
  sitemapIndexXml,
  urlsetXml,
  type SiteConfig,
  type SitemapUrl,
} from "@coingist/seo";
import { postPath, type PostSummary, type SitemapData } from "@coingist/types";
import { api } from "./api.server";
import { isDemo, siteConfig } from "./config.server";
import { SECTION_LABEL } from "./format";

export function xmlResponse(body: string, contentType: string, maxAge: number): Response {
  return new Response(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`,
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${maxAge}, stale-while-revalidate=604800`,
      "X-Content-Type-Options": "nosniff",
      ...(isDemo() ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    },
  });
}

const categoryPath = (slug: string) => (slug === "africa" ? "/africa" : `/category/${slug}`);
const latest = (dates: Array<string | null | undefined>) =>
  dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

/** Static and listing pages. */
export function pageUrls(site: SiteConfig, data: SitemapData): SitemapUrl[] {
  const newest = (type?: string) => latest(data.posts.filter((p) => !type || p.type === type).map((p) => p.publishedAt));
  return [
    { loc: absoluteUrl(site, "/"), lastmod: newest() },
    { loc: absoluteUrl(site, "/news"), lastmod: newest("news") },
    { loc: absoluteUrl(site, "/gist"), lastmod: newest("gist") },
    { loc: absoluteUrl(site, "/learn"), lastmod: newest("learn") },
    { loc: absoluteUrl(site, "/newsletter") },
    { loc: absoluteUrl(site, "/about") },
    { loc: absoluteUrl(site, "/editorial-policy") },
    { loc: absoluteUrl(site, "/advertise") },
    { loc: absoluteUrl(site, "/privacy") },
    { loc: absoluteUrl(site, "/terms") },
    ...data.categories.map((c) => ({ loc: absoluteUrl(site, categoryPath(c.slug)), lastmod: c.lastPublishedAt })),
    ...data.authors.map((a) => ({ loc: absoluteUrl(site, `/author/${a.slug}`), lastmod: a.lastPublishedAt })),
    ...data.tags.map((t) => ({ loc: absoluteUrl(site, `/tag/${t.slug}`), lastmod: t.lastPublishedAt })),
  ];
}

export async function sitemapIndex(): Promise<string> {
  const site = siteConfig();
  const data = await api.sitemap();
  const newest = latest(data.posts.map((p) => p.updatedAt));
  return sitemapIndexXml([
    { loc: absoluteUrl(site, "/sitemap-pages.xml"), lastmod: newest },
    { loc: absoluteUrl(site, "/sitemap-posts.xml"), lastmod: newest },
    { loc: absoluteUrl(site, "/news-sitemap.xml"), lastmod: newest },
  ]);
}

export async function pagesSitemap(): Promise<string> {
  const site = siteConfig();
  return urlsetXml(pageUrls(site, await api.sitemap()));
}

export async function postsSitemap(): Promise<string> {
  const site = siteConfig();
  const data = await api.sitemap();
  return urlsetXml(data.posts.map((p) => ({ loc: absoluteUrl(site, postPath(p)), lastmod: p.updatedAt })));
}

const NEWS_WINDOW_MS = 48 * 3600 * 1000;

/** Google News: the last 48 hours of editorial stories. Sponsored content is excluded. */
export async function newsSitemap(now = Date.now()): Promise<string> {
  const site = siteConfig();
  const data = await api.sitemap();
  const recent = data.posts.filter((p) => !p.isSponsored && now - Date.parse(p.publishedAt) <= NEWS_WINDOW_MS);
  return newsSitemapXml(
    { name: site.name, language: site.locale },
    recent.map((p) => ({ loc: absoluteUrl(site, postPath(p)), title: p.title, publishedAt: p.publishedAt })),
  );
}

export type FeedScope = { kind: "all" } | { kind: "section"; type: "news" | "gist" | "learn" } | { kind: "category"; slug: string };

function feedItem(site: SiteConfig, p: PostSummary) {
  return {
    title: p.isSponsored ? `Sponsored: ${p.title}` : p.title,
    link: absoluteUrl(site, postPath(p)),
    description: p.excerpt ?? "",
    publishedAt: p.publishedAt,
    author: p.author?.name ?? "CoinGist Desk",
    categories: [p.category?.name, p.type === "sponsored" ? "Sponsored" : SECTION_LABEL[p.type]].filter(
      (c): c is string => !!c,
    ),
  };
}

export async function rssFeed(scope: FeedScope): Promise<string> {
  const site = siteConfig();
  const params =
    scope.kind === "section" ? { type: scope.type } : scope.kind === "category" ? { category: scope.slug } : {};
  const list = await api.listPosts({ ...params, pageSize: 50 });
  const path =
    scope.kind === "all" ? "/" : scope.kind === "section" ? `/${scope.type}` : categoryPath(scope.slug);
  const label =
    scope.kind === "all"
      ? site.name
      : scope.kind === "section"
        ? `${SECTION_LABEL[scope.type]} | ${site.name}`
        : `${scope.slug === "africa" ? "Africa" : (await api.getCategory(scope.slug)).name} | ${site.name}`;
  return rssXml({
    title: label,
    link: absoluteUrl(site, path),
    selfUrl: absoluteUrl(site, path === "/" ? "/rss.xml" : `${path}/rss.xml`),
    description: site.description,
    language: site.locale,
    items: list.items.map((p) => feedItem(site, p)),
  });
}
