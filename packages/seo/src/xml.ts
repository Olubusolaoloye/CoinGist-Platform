/** Escape text for XML and drop characters XML 1.0 forbids (which break feed readers). */
export function xmlEscape(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DECL = '<?xml version="1.0" encoding="UTF-8"?>';

export interface SitemapUrl {
  loc: string;
  lastmod?: string | null | undefined;
}

export function sitemapIndexXml(sitemaps: SitemapUrl[]): string {
  const items = sitemaps
    .map((s) => `<sitemap><loc>${xmlEscape(s.loc)}</loc>${s.lastmod ? `<lastmod>${xmlEscape(s.lastmod)}</lastmod>` : ""}</sitemap>`)
    .join("\n");
  return `${DECL}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export function urlsetXml(urls: SitemapUrl[]): string {
  const items = urls
    .map((u) => `<url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${xmlEscape(u.lastmod)}</lastmod>` : ""}</url>`)
    .join("\n");
  return `${DECL}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

export interface NewsSitemapItem {
  loc: string;
  title: string;
  publishedAt: string;
}

/** Google News sitemap: articles from the last 48 hours, at most 1,000. */
export function newsSitemapXml(publication: { name: string; language: string }, items: NewsSitemapItem[]): string {
  const pub = `<news:publication><news:name>${xmlEscape(publication.name)}</news:name><news:language>${xmlEscape(publication.language)}</news:language></news:publication>`;
  const urls = items
    .slice(0, 1000)
    .map(
      (i) =>
        `<url><loc>${xmlEscape(i.loc)}</loc><news:news>${pub}<news:publication_date>${xmlEscape(i.publishedAt)}</news:publication_date><news:title>${xmlEscape(i.title)}</news:title></news:news></url>`,
    )
    .join("\n");
  return `${DECL}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>\n`;
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  author?: string | null | undefined;
  categories?: string[] | undefined;
}

/** RSS 2.0 with an Atom self link and Dublin Core creator (what most readers expect). */
export function rssXml(channel: {
  title: string;
  link: string;
  selfUrl: string;
  description: string;
  language: string;
  items: RssItem[];
}): string {
  const date = (iso: string) => new Date(iso).toUTCString();
  const items = channel.items
    .map((i) =>
      [
        "<item>",
        `<title>${xmlEscape(i.title)}</title>`,
        `<link>${xmlEscape(i.link)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(i.link)}</guid>`,
        `<pubDate>${date(i.publishedAt)}</pubDate>`,
        i.author ? `<dc:creator>${xmlEscape(i.author)}</dc:creator>` : "",
        ...(i.categories ?? []).map((c) => `<category>${xmlEscape(c)}</category>`),
        `<description>${xmlEscape(i.description)}</description>`,
        "</item>",
      ].join(""),
    )
    .join("\n");
  const lastBuild = channel.items[0]?.publishedAt ?? new Date(0).toISOString();
  return `${DECL}
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${xmlEscape(channel.title)}</title>
<link>${xmlEscape(channel.link)}</link>
<atom:link href="${xmlEscape(channel.selfUrl)}" rel="self" type="application/rss+xml"/>
<description>${xmlEscape(channel.description)}</description>
<language>${xmlEscape(channel.language)}</language>
<lastBuildDate>${date(lastBuild)}</lastBuildDate>
${items}
</channel>
</rss>
`;
}
