import { sanitizeRichText, type PostType, type RichTextDoc, type StudioPost } from "@coingist/types";

/** Everything the editor can change, in the shape the API's PATCH accepts. */
export interface Draft {
  type: PostType;
  title: string;
  slug: string;
  excerpt: string;
  summaryBullets: string[];
  body: RichTextDoc;
  heroImageUrl: string;
  heroImageAlt: string;
  categorySlug: string;
  tagSlugs: string[];
  seoTitle: string;
  seoDescription: string;
  aiAssisted: boolean;
  featured: boolean;
}

export function draftFromPost(p: StudioPost): Draft {
  return {
    type: p.type,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt ?? "",
    summaryBullets: p.summaryBullets,
    body: p.body,
    heroImageUrl: p.heroImage?.url ?? "",
    heroImageAlt: p.heroImage?.alt ?? "",
    categorySlug: p.category?.slug ?? "",
    tagSlugs: p.tags.map((t) => t.slug),
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    aiAssisted: p.aiAssisted,
    featured: p.featured,
  };
}

export function draftToPayload(d: Draft) {
  return {
    ...d,
    categorySlug: d.categorySlug || null,
    summaryBullets: d.summaryBullets.map((b) => b.trim()).filter(Boolean),
    isSponsored: d.type === "sponsored",
  };
}

/**
 * Stable fingerprint for "are there unsaved changes?". The body is compared in its sanitised
 * form, because Tiptap's JSON carries extra empty attributes the stored version doesn't.
 */
export function draftFingerprint(d: Draft): string {
  return JSON.stringify({ ...draftToPayload(d), body: sanitizeRichText(d.body) });
}
