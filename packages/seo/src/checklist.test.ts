import { describe, expect, it } from "vitest";
import { bodyStats, seoChecklist, type ChecklistInput } from "./checklist.js";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const base: ChecklistInput = {
  type: "news",
  title: "Stablecoin transfers climb as users seek cheaper remittances",
  slug: "stablecoin-transfers-climb",
  excerpt: "Why more people across West Africa are sending dollar-pegged tokens home instead of using banks.",
  seoTitle: null,
  seoDescription: null,
  summaryBullets: ["One", "Two"],
  heroImage: { url: "/a.png", alt: "Chart" },
  categorySlug: "stablecoins",
  body: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: words(300) }] },
      { type: "paragraph", content: [{ type: "text", text: "guide", marks: [{ type: "link", attrs: { href: "/learn/x" } }] }] },
    ],
  },
};
const status = (input: ChecklistInput) => Object.fromEntries(seoChecklist(input).map((c) => [c.id, c.status]));

describe("seoChecklist", () => {
  it("passes a well-prepared story", () => {
    expect(Object.values(status(base)).every((s) => s === "pass")).toBe(true);
  });

  it("flags missing basics as failures", () => {
    const s = status({ ...base, excerpt: null, categorySlug: null, summaryBullets: [], heroImage: { url: "/a.png", alt: " " } });
    expect(s).toMatchObject({ description: "fail", category: "fail", gist: "fail", "hero-image": "fail" });
  });

  it("warns on length problems and missing internal links", () => {
    const s = status({ ...base, title: "Short", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "tiny" }] }] } });
    expect(s).toMatchObject({ "title-length": "warn", length: "warn", "internal-links": "warn" });
  });

  it("uses a lower word floor for gists and prefers the SEO title over the headline", () => {
    const gist = { ...base, type: "gist" as const, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words(90), marks: [{ type: "link", attrs: { href: "/x" } }] }] }] } };
    expect(status(gist)["length"]).toBe("pass");
    expect(status({ ...base, title: "x", seoTitle: "A proper search title that is long enough" })["title-length"]).toBe("pass");
  });

  it("counts images without alt text", () => {
    expect(bodyStats({ type: "doc", content: [{ type: "image", attrs: { src: "/a.png", alt: "" } }] }).imagesMissingAlt).toBe(1);
  });
});
