import { z } from "zod";
import { MAX_BODY_BYTES } from "./richtext.js";
import type { BlockedLink } from "./commerce.js";
import type { CategoryRef, ImageRef, RichTextDoc, TagRef } from "./content.js";
import { POST_STATUSES, POST_TYPES, type PostStatus, type PostType } from "./enums.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "untitled"
  );
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

const httpsOrPath = z
  .string()
  .max(1000)
  .refine((s) => s === "" || s.startsWith("/") || /^https:\/\//.test(s), "Use an https:// URL or a /path")
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional();

export const CreatePostInputSchema = z
  .object({
    type: z.enum(POST_TYPES).default("news"),
    title: z.string().trim().min(1).max(300),
  })
  .strict();
export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;

export const UpdatePostInputSchema = z
  .object({
    type: z.enum(POST_TYPES),
    title: z.string().trim().min(1).max(300),
    slug: z.string().regex(SLUG, "lowercase letters, numbers and single hyphens").max(120),
    excerpt: optionalText(400),
    summaryBullets: z.array(z.string().trim().min(1).max(200)).max(5),
    body: z
      .object({ type: z.literal("doc") })
      .passthrough()
      .refine((d) => JSON.stringify(d).length <= MAX_BODY_BYTES, "Story is too long to save"),
    heroImageUrl: httpsOrPath,
    heroImageAlt: optionalText(300),
    categorySlug: z.string().regex(SLUG).nullable().optional(),
    tagSlugs: z.array(z.string().regex(SLUG)).max(10),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    canonical: httpsOrPath,
    isSponsored: z.boolean(),
    sponsorId: z.string().uuid().nullable().optional(),
    aiAssisted: z.boolean(),
    /** Editors only (enforced in the database). */
    featured: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => !(v.heroImageUrl && !v.heroImageAlt), {
    message: "Hero images need alt text",
    path: ["heroImageAlt"],
  });
export type UpdatePostInput = z.infer<typeof UpdatePostInputSchema>;

export const TransitionInputSchema = z
  .object({
    to: z.enum(POST_STATUSES),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
export type TransitionInput = z.infer<typeof TransitionInputSchema>;

export const CommentInputSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    parentId: z.string().uuid().optional(),
  })
  .strict();
export type CommentInput = z.infer<typeof CommentInputSchema>;

export interface StudioPostSummary {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  status: PostStatus;
  author: { id: string; name: string | null };
  category: CategoryRef | null;
  updatedAt: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  openComments: number;
  aiAssisted: boolean;
  heroImage: ImageRef | null;
}

export interface StudioPost {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  excerpt: string | null;
  summaryBullets: string[];
  body: RichTextDoc;
  heroImage: ImageRef | null;
  category: CategoryRef | null;
  tags: TagRef[];
  author: { id: string; name: string | null };
  status: PostStatus;
  approvedBy: { id: string; name: string | null } | null;
  approvedAt: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonical: string | null;
  isSponsored: boolean;
  sponsorId: string | null;
  aiAssisted: boolean;
  featured: boolean;
}

export interface EditorialComment {
  id: string;
  postId: string;
  parentId: string | null;
  author: { id: string; name: string | null };
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RevisionSummary {
  id: string;
  title: string;
  editor: { id: string; name: string | null } | null;
  createdAt: string;
}
export interface Revision extends RevisionSummary {
  body: RichTextDoc;
}

/** Admin → Site images: a category's description and cover image. */
export const UpdateCategoryInputSchema = z
  .object({
    description: optionalText(300),
    imageUrl: httpsOrPath,
    imageAlt: optionalText(300),
  })
  .refine((v) => !(v.imageUrl && !v.imageAlt), { message: "Add alt text for the image", path: ["imageAlt"] });
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>;

/** Everything the story editor needs, loaded in one request. */
export interface StudioEditorBundle {
  post: StudioPost;
  comments: EditorialComment[];
  revisions: RevisionSummary[];
  categories: CategoryRef[];
  tags: TagRef[];
  /** Links in the story that point at blocked domains. */
  blocked: BlockedLink[];
}
