import { z } from "zod";

/** One comment as readers see it. Removed comments keep their place only if they have replies. */
export interface PublicComment {
  id: string;
  parentId: string | null;
  author: { id: string; name: string; avatarUrl: string | null; isStaff: boolean } | null;
  body: string;
  removed: boolean;
  likes: number;
  createdAt: string;
  edited: boolean;
}

/** Likes and comments for one story, as anyone sees them. */
export interface StoryEngagement {
  likes: number;
  comments: PublicComment[];
}

/** What the signed-in reader has liked on one story's page. */
export interface MyEngagement {
  likedPost: boolean;
  likedCommentIds: string[];
}

export const COMMENT_MAX = 2000;

export const CommentInputBodySchema = z.string().trim().min(1, "Write something first").max(COMMENT_MAX, "Comments can be up to 2,000 characters");

export const NewCommentSchema = z
  .object({ body: CommentInputBodySchema, parentId: z.string().uuid().optional() })
  .strict();
export type NewComment = z.infer<typeof NewCommentSchema>;

export const ReportCommentSchema = z.object({ reason: z.string().trim().max(300).default("") }).strict();

export const DisplayNameSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(60) }).strict();

export const MODERATION_FILTERS = ["reported", "hidden", "all"] as const;
export type ModerationFilter = (typeof MODERATION_FILTERS)[number];

/** A comment in Studio's moderation list. */
export interface ModerationComment {
  id: string;
  post: { id: string; title: string; type: string; slug: string };
  parentId: string | null;
  author: { id: string; name: string; email: string; status: string };
  body: string;
  status: "visible" | "hidden";
  hiddenByReports: boolean;
  reports: number;
  reportReasons: string[];
  likes: number;
  createdAt: string;
}
