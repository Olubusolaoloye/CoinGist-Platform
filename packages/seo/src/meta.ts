import { absoluteUrl, type SiteConfig } from "./site.js";

/** Structurally compatible with React Router's MetaDescriptor. */
export type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: "link"; rel: string; href: string; [attr: string]: string }
  | { "script:ld+json": Record<string, unknown> | Array<Record<string, unknown>> };

export interface PageMetaInput {
  site: SiteConfig;
  /** Path of this page, used for the canonical URL unless `canonical` is set. */
  path: string;
  title: string;
  description: string;
  /** If false, the site name is not appended to the title. */
  appendSiteName?: boolean;
  canonical?: string | null | undefined;
  image?: { url: string; alt: string } | null | undefined;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
  article?: {
    publishedTime: string;
    modifiedTime: string;
    section?: string | undefined;
    tags?: string[] | undefined;
    authorUrl?: string | undefined;
  };
  jsonLd?: Array<Record<string, unknown>>;
}

const MAX_TITLE = 70;
const MAX_DESCRIPTION = 160;

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Strip query/hash and trailing slash (except root) so each page has one canonical URL. */
export function canonicalUrl(site: Pick<SiteConfig, "url">, path: string): string {
  const u = new URL(absoluteUrl(site, path));
  u.search = "";
  u.hash = "";
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

export function buildMeta(input: PageMetaInput): MetaTag[] {
  const { site } = input;
  // Shorten the page title, never the brand suffix.
  const suffix =
    input.appendSiteName === false || input.title === site.name ? "" : ` | ${site.name}`;
  const title = truncate(input.title, MAX_TITLE - suffix.length) + suffix;
  const description = truncate(input.description, MAX_DESCRIPTION);
  const canonical = input.canonical
    ? absoluteUrl(site, input.canonical)
    : canonicalUrl(site, input.path);
  const image = input.image ?? { url: site.defaultImage, alt: site.name };
  const imageUrl = absoluteUrl(site, image.url);

  const tags: MetaTag[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:site_name", content: site.name },
    { property: "og:locale", content: site.locale },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:title", content: truncate(input.title, 95) },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:image", content: imageUrl },
    { property: "og:image:alt", content: image.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: truncate(input.title, 70) },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: image.alt },
  ];
  if (site.xHandle) tags.push({ name: "twitter:site", content: site.xHandle });
  if (input.noindex) tags.push({ name: "robots", content: "noindex, follow" });
  else tags.push({ name: "robots", content: "index, follow, max-image-preview:large" });

  if (input.article) {
    const a = input.article;
    tags.push({ property: "article:published_time", content: a.publishedTime });
    tags.push({ property: "article:modified_time", content: a.modifiedTime });
    if (a.section) tags.push({ property: "article:section", content: a.section });
    if (a.authorUrl) tags.push({ property: "article:author", content: a.authorUrl });
    for (const tag of a.tags ?? []) tags.push({ property: "article:tag", content: tag });
  }

  for (const ld of input.jsonLd ?? []) tags.push({ "script:ld+json": ld });
  return tags;
}
