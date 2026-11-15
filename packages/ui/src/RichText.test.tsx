import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RichTextDoc, RichTextNode } from "@coingist/types";
import { readingTimeMinutes, RichText } from "./RichText.js";

const html = (content: RichTextNode[], opts: { sponsored?: boolean } = {}) =>
  renderToStaticMarkup(
    <RichText doc={{ type: "doc", content } as RichTextDoc} siteOrigin="https://coingist.test" {...opts} />,
  );
const t = (text: string, marks?: RichTextNode["marks"]): RichTextNode => ({ type: "text", text, ...(marks ? { marks } : {}) });
const link = (href: string) => [{ type: "paragraph", content: [t("x", [{ type: "link", attrs: { href } }])] }];

describe("RichText rendering", () => {
  it("renders the common nodes and marks", () => {
    const out = html([
      { type: "heading", attrs: { level: 2 }, content: [t("Title")] },
      { type: "paragraph", content: [t("bold", [{ type: "bold" }]), t(" and "), t("it", [{ type: "italic" }])] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("a")] }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [t("q")] }] },
    ]);
    expect(out).toBe(
      "<h2>Title</h2><p><strong>bold</strong> and <em>it</em></p><ul><li><p>a</p></li></ul><blockquote><p>q</p></blockquote>",
    );
  });

  it("demotes h1 and clamps odd heading levels", () => {
    expect(html([{ type: "heading", attrs: { level: 1 }, content: [t("x")] }])).toBe("<h2>x</h2>");
    expect(html([{ type: "heading", attrs: { level: "9 onclick=alert(1)" }, content: [t("x")] }])).toBe("<h2>x</h2>");
    expect(html([{ type: "heading", attrs: { level: 6 }, content: [t("x")] }])).toBe("<h4>x</h4>");
  });

  it("marks external links nofollow/noopener and leaves internal links plain", () => {
    expect(html(link("https://other.test/a"))).toContain('rel="noopener noreferrer nofollow" target="_blank"');
    expect(html(link("/learn/x"))).toBe('<p><a href="/learn/x">x</a></p>');
    expect(html(link("https://coingist.test/news/y"))).toBe('<p><a href="https://coingist.test/news/y">x</a></p>');
  });

  it("uses rel=sponsored for outbound links in sponsored posts", () => {
    expect(html(link("https://sponsor.test"), { sponsored: true })).toContain('rel="noopener noreferrer sponsored"');
  });
});

describe("RichText sanitising", () => {
  it.each(["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.test"])(
    "drops dangerous href %s",
    (href) => {
      expect(html(link(href))).toBe("<p>x</p>");
    },
  );

  it("escapes text content", () => {
    expect(html([{ type: "paragraph", content: [t('<script>alert("x")</script>')] }])).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });

  it("drops unknown nodes but keeps their text", () => {
    expect(
      html([{ type: "rawHtml", attrs: { html: "<img src=x onerror=alert(1)>" }, content: [t("kept")] }]),
    ).toBe("kept");
    expect(html([{ type: "iframe", attrs: { src: "https://evil.test" } }])).toBe("");
  });

  it("ignores unknown marks and arbitrary attributes", () => {
    expect(
      html([{ type: "paragraph", attrs: { onclick: "alert(1)", style: "x" }, content: [t("a", [{ type: "onmouseover" }])] }]),
    ).toBe("<p>a</p>");
  });

  it("only allows https or relative images, lazy-loaded with fixed dimensions", () => {
    expect(html([{ type: "image", attrs: { src: "data:image/svg+xml,<svg onload=alert(1)>" } }])).toBe("");
    expect(html([{ type: "image", attrs: { src: "http://insecure.test/a.png" } }])).toBe("");
    const out = html([{ type: "image", attrs: { src: "https://cdn.test/a.webp", alt: "A", width: 800, height: 450 } }]);
    expect(out).toBe(
      '<figure><img src="https://cdn.test/a.webp" alt="A" width="800" height="450" loading="lazy" decoding="async"/></figure>',
    );
  });

  it("survives malformed input", () => {
    const bad = [null, 42, { type: "paragraph", content: "nope" }, { type: "text", text: { evil: 1 } }] as unknown as RichTextNode[];
    expect(() => html(bad)).not.toThrow();
  });
});

describe("readingTimeMinutes", () => {
  it("is at least one minute and scales with length", () => {
    const words = (n: number): RichTextDoc => ({ type: "doc", content: [{ type: "paragraph", content: [t(Array(n).fill("w").join(" "))] }] });
    expect(readingTimeMinutes(words(10))).toBe(1);
    expect(readingTimeMinutes(words(1100))).toBe(5);
  });
});
