import { z } from "zod";
import type { PostSummary } from "./content.js";

/** Reader accounts: saved stories, follows and the personalised feed. */
export const FOLLOW_TYPES = ["author", "category", "tag"] as const;
export type FollowType = (typeof FOLLOW_TYPES)[number];

export const FOLLOW_TYPE_LABEL: Record<FollowType, string> = { author: "Writer", category: "Topic", tag: "Tag" };

export interface FollowTarget {
  type: FollowType;
  slug: string;
  name: string;
}

const Slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Not a valid slug");

export const FollowInputSchema = z.object({ type: z.enum(FOLLOW_TYPES), slug: Slug }).strict();
export type FollowInput = z.infer<typeof FollowInputSchema>;

export interface SavedStory extends PostSummary {
  savedAt: string;
}

export interface FeedStory extends PostSummary {
  /** The follow that put this story in the feed (the most specific one). */
  because: { type: FollowType; name: string };
}

export interface ReaderFeed {
  items: FeedStory[];
  page: number;
  pageSize: number;
  total: number;
  follows: FollowTarget[];
}

/** What a page needs to show a reader's buttons in the right state. */
export interface ReaderState {
  bookmarked: boolean;
  follows: FollowTarget[];
}

/** Most follows per reader (keeps the feed query cheap and stops abuse). */
export const MAX_FOLLOWS = 100;
export const MAX_BOOKMARKS = 1000;
