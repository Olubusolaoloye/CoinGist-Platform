import { slugify, type AiClaims, type AiDraft, type AiGist, type AiOutline, type AiSeo, type RepurposeFormat } from "@coingist/types";
import type { AiTasks } from "./provider.js";

/**
 * Enforce the limits the prompts ask for, so a long-winded or creative answer can never break
 * the page or slip in something the writer didn't provide.
 */
const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};
const list = (xs: string[], maxItems: number, maxLen: number) =>
  xs.map((x) => clip(x.replace(/^[-•*\d.)\s]+/, ""), maxLen)).filter(Boolean).slice(0, maxItems);

/** Normalise quotes, dashes and spacing so a quote can be matched against the story text. */
const norm = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

export const clean = {
  outline: (o: AiOutline): AiOutline => ({
    sections: o.sections.slice(0, 8).map((s) => ({ heading: clip(s.heading, 120), points: list(s.points, 6, 300) })).filter((s) => s.heading),
    openQuestions: list(o.openQuestions, 8, 300),
  }),
  draft: (d: AiDraft): AiDraft => ({ paragraphs: list(d.paragraphs, 12, 1_500), toVerify: list(d.toVerify, 12, 300) }),
  gist: (g: AiGist): AiGist => ({ bullets: list(g.bullets, 3, 200) }),
  seo: (s: AiSeo, title: string): AiSeo => ({
    seoTitle: clip(s.seoTitle, 60),
    seoDescription: clip(s.seoDescription, 160),
    slug: (slugify(s.slug) || slugify(title)).split("-").slice(0, 8).join("-"),
    excerpt: clip(s.excerpt, 300),
  }),
  repurpose: (posts: string[], format: RepurposeFormat): string[] =>
    format === "x_thread"
      ? posts.map((p) => clip(p, 280)).filter(Boolean).slice(0, 8)
      : posts.slice(0, 1).map((p) => p.trim().slice(0, format === "telegram" ? 1_000 : 600)),
  /** Keep only claims whose quote really appears in the story. */
  claims: (c: AiClaims, text: string): AiClaims => {
    const hay = norm(text);
    return {
      claims: c.claims
        .map((x) => ({ quote: x.quote.trim().replace(/^["“]|["”]$/g, ""), issue: clip(x.issue, 300), suggestion: clip(x.suggestion, 300) }))
        .filter((x) => x.quote.length >= 8 && hay.includes(norm(x.quote)))
        .slice(0, 10),
    };
  },
  /** Keep only links that came from the feeds, and only covered-by ids we offered. */
  trending: (
    out: AiTasks["trending"]["output"],
    input: AiTasks["trending"]["input"],
  ) => {
    const links = new Set(input.headlines.map((h) => h.link));
    const covered = new Map(input.covered.map((c) => [c.id, c]));
    return out.topics.slice(0, 8).map((t) => ({
      title: clip(t.title, 120),
      whyItMatters: clip(t.whyItMatters, 500),
      angle: clip(t.angle, 400),
      suggestedHeadline: clip(t.suggestedHeadline, 140),
      sourceLinks: [...new Set(t.sourceLinks)].filter((l) => links.has(l)).slice(0, 5),
      coveredBy: t.coveredById && covered.has(t.coveredById) ? covered.get(t.coveredById)! : null,
    }));
  },
};
