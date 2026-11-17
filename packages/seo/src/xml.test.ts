import { describe, expect, it } from "vitest";
import { newsSitemapXml, rssXml, sitemapIndexXml, urlsetXml, xmlEscape } from "./xml.js";

describe("xmlEscape", () => {
  it("escapes markup and strips forbidden control characters", () => {
    expect(xmlEscape(`Tom & "Jerry" <b>'s</b>`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt;&apos;s&lt;/b&gt;");
    expect(xmlEscape("bad\u0000\u0007\u001Fchars\tok\n")).toBe("badchars\tok\n");
  });
});

describe("sitemaps", () => {
  it("builds an index and a urlset", () => {
    expect(sitemapIndexXml([{ loc: "https://x.test/sitemap-posts.xml", lastmod: "2026-11-15T00:00:00.000Z" }])).toContain(
      "<sitemap><loc>https://x.test/sitemap-posts.xml</loc><lastmod>2026-11-15T00:00:00.000Z</lastmod></sitemap>",
    );
    const set = urlsetXml([{ loc: "https://x.test/a?b=1&c=2" }, { loc: "https://x.test/", lastmod: null }]);
    expect(set).toContain("<url><loc>https://x.test/a?b=1&amp;c=2</loc></url>");
    expect(set.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("builds a Google News sitemap capped at 1,000 items", () => {
    const xml = newsSitemapXml({ name: "CoinGist", language: "en" }, [
      { loc: "https://x.test/news/a", title: "Bitcoin & Naira <analysis>", publishedAt: "2026-11-15T10:00:00.000Z" },
    ]);
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain("<news:name>CoinGist</news:name><news:language>en</news:language>");
    expect(xml).toContain("<news:title>Bitcoin &amp; Naira &lt;analysis&gt;</news:title>");
    const many = Array.from({ length: 1200 }, (_, i) => ({ loc: `https://x.test/${i}`, title: "t", publishedAt: "2026-11-15T10:00:00.000Z" }));
    expect(newsSitemapXml({ name: "C", language: "en" }, many).match(/<url>/g)).toHaveLength(1000);
  });
});

describe("rssXml", () => {
  it("builds RSS 2.0 with self link, creator, categories and RFC 822 dates", () => {
    const xml = rssXml({
      title: "CoinGist",
      link: "https://x.test/",
      selfUrl: "https://x.test/rss.xml",
      description: "News",
      language: "en",
      items: [
        { title: "A <b>", link: "https://x.test/news/a", description: "Ex & cerpt", publishedAt: "2026-11-15T10:00:00.000Z", author: "Amara", categories: ["Bitcoin"] },
      ],
    });
    expect(xml).toContain('<atom:link href="https://x.test/rss.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain("<title>A &lt;b&gt;</title>");
    expect(xml).toContain("<pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain("<dc:creator>Amara</dc:creator><category>Bitcoin</category><description>Ex &amp; cerpt</description>");
    expect(xml).toContain('<guid isPermaLink="true">https://x.test/news/a</guid>');
  });
});
