import { describe, expect, it } from "vitest";
import { sanitizeRichText, xPostUrl, youtubeId } from "./richtext.js";
import { slugify, UpdatePostInputSchema } from "./studio.js";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });

describe("sanitizeRichText", () => {
  it("keeps allowed structure unchanged", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [t("Hi")] },
      p(t("bold", [{ type: "bold" }]), t(" link", [{ type: "link", attrs: { href: "https://a.test/" } }])),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("x"))] }] },
    );
    expect(sanitizeRichText(input)).toEqual(input);
  });

  it("drops dangerous links, unknown marks and stray attributes", () => {
    const out = sanitizeRichText(
      doc({
        type: "paragraph",
        attrs: { onclick: "x", class: "y" },
        content: [
          t("a", [{ type: "link", attrs: { href: "javascript:alert(1)", target: "_self" } }]),
          t("b", [{ type: "highlight", attrs: { color: "red" } }, { type: "italic", attrs: { x: 1 } }]),
        ],
      }),
    );
    expect(out).toEqual(doc(p(t("a"), t("b", [{ type: "italic" }]))));
  });

  it("unwraps unknown nodes and drops unsafe images and embeds", () => {
    const out = sanitizeRichText(
      doc(
        { type: "rawHtml", content: [p(t("kept"))] },
        { type: "image", attrs: { src: "javascript:x", alt: "a" } },
        { type: "image", attrs: { src: "https://cdn.test/a.webp", alt: "A", width: "800", onerror: "x" } },
        { type: "youtube", attrs: { src: "https://evil.test/watch?v=dQw4w9WgXcQ" } },
        { type: "youtube", attrs: { src: "https://youtu.be/dQw4w9WgXcQ" } },
        { type: "xPost", attrs: { src: "https://twitter.com/coingist/status/1234567890" } },
      ),
    );
    expect(out.content).toEqual([
      p(t("kept")),
      { type: "image", attrs: { src: "https://cdn.test/a.webp", alt: "A", width: 800 } },
      { type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      { type: "xPost", attrs: { src: "https://x.com/coingist/status/1234567890" } },
    ]);
  });

  it("clamps headings and survives garbage", () => {
    expect(sanitizeRichText(doc({ type: "heading", attrs: { level: 1 }, content: [t("x")] })).content).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [t("x")] },
    ]);
    expect(sanitizeRichText(null)).toEqual({ type: "doc", content: [] });
    expect(sanitizeRichText({ type: "doc", content: [null, 4, "x", { type: "text", text: 5 }] })).toEqual({
      type: "doc",
      content: [],
    });
  });

  it("limits nesting depth", () => {
    let node: unknown = p(t("deep"));
    for (let i = 0; i < 30; i++) node = { type: "blockquote", content: [node] };
    expect(JSON.stringify(sanitizeRichText(doc(node)))).not.toContain("deep");
  });
});

describe("embed URL parsing", () => {
  it("accepts only real YouTube and X URLs", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(xPostUrl("https://x.com/a_b/status/123456789")).toBe("https://x.com/a_b/status/123456789");
    expect(xPostUrl("https://x.com.evil/a/status/123456789")).toBeNull();
  });
});

describe("studio input", () => {
  it("slugifies titles", () => {
    expect(slugify("Naira & Bitcoin: What's next?")).toBe("naira-bitcoin-what-s-next");
    expect(slugify("Ọ̀rọ̀ ajé")).toBe("oro-aje");
    expect(slugify("!!!")).toBe("untitled");
  });

  it("requires alt text for hero images and rejects unknown fields", () => {
    expect(UpdatePostInputSchema.safeParse({ heroImageUrl: "https://a.test/x.png" }).success).toBe(false);
    expect(UpdatePostInputSchema.safeParse({ heroImageUrl: "https://a.test/x.png", heroImageAlt: "A chart" }).success).toBe(true);
    expect(UpdatePostInputSchema.safeParse({ status: "published" }).success).toBe(false);
    expect(UpdatePostInputSchema.safeParse({ heroImageUrl: "javascript:x", heroImageAlt: "a" }).success).toBe(false);
  });
});
