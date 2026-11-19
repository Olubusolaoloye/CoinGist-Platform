import type { PostType } from "./enums.js";

/** Tiptap / ProseMirror JSON document. Rendered with an allowlist, never as raw HTML. */
export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}
export interface RichTextDoc extends RichTextNode {
  type: "doc";
}

export interface CategoryRef {
  slug: string;
  name: string;
}
export interface Category extends CategoryRef {
  description: string | null;
  /** Cover image, editable by admins in Studio (Admin → Site images). */
  image: ImageRef | null;
}

export interface TagRef {
  slug: string;
  name: string;
}

export interface AuthorRef {
  slug: string;
  name: string;
  avatarUrl: string | null;
}
export interface AuthorProfile extends AuthorRef {
  bio: string | null;
  socials: Record<string, string>;
  expertise: string[];
}

export interface ImageRef {
  url: string;
  alt: string;
}

export interface PostSummary {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImage: ImageRef | null;
  category: CategoryRef | null;
  author: AuthorRef | null;
  publishedAt: string;
  updatedAt: string;
  isSponsored: boolean;
  sponsorName: string | null;
  /** Estimated reading time in whole minutes (at least 1). */
  readMinutes: number;
}

export interface PostDetail extends PostSummary {
  summaryBullets: string[];
  body: RichTextDoc;
  tags: TagRef[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonical: string | null;
  aiAssisted: boolean;
  sponsor: { name: string; website: string | null } | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Public URL path for a post: /:section/:slug where section is the post type. */
export function postPath(post: Pick<PostSummary, "type" | "slug">): string {
  return `/${post.type}/${post.slug}`;
}

/** Everything the sitemaps need, in one lightweight payload. */
export interface SitemapData {
  posts: Array<{
    type: PostType;
    slug: string;
    title: string;
    publishedAt: string;
    updatedAt: string;
    isSponsored: boolean;
    tags: string[];
  }>;
  categories: Array<{ slug: string; lastPublishedAt: string | null }>;
  authors: Array<{ slug: string; lastPublishedAt: string | null }>;
  /** Only tags with enough stories to be indexed (thin tag pages are noindex). */
  tags: Array<{ slug: string; lastPublishedAt: string }>;
}

/** Tag pages with fewer stories than this are noindex and left out of sitemaps. */
export const MIN_INDEXABLE_TAG_POSTS = 3;

/** One coin in the site's price ticker. */
export interface PriceQuote {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  /** Percent change over 24 hours (null if unknown). */
  change24h: number | null;
}

export interface PriceTicker {
  quotes: PriceQuote[];
  /** Data source, shown as attribution. */
  source: string;
  updatedAt: string;
  /** True for the built-in sample data (local development, tests, previews). */
  sample: boolean;
}
