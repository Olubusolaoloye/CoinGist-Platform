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
