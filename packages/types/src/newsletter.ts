import { z } from "zod";
import type { SubscriberStatus } from "./enums.js";

export const NEWSLETTER_LISTS = ["daily-gist", "weekly-wrap"] as const;
export type NewsletterList = (typeof NEWSLETTER_LISTS)[number];

export const NEWSLETTER_LIST_INFO: Record<NewsletterList, { name: string; cadence: string; description: string }> = {
  "daily-gist": {
    name: "The Daily Gist",
    cadence: "Weekday mornings",
    description: "The five crypto stories that matter today, in a two-minute read.",
  },
  "weekly-wrap": {
    name: "The Weekly Wrap",
    cadence: "Saturdays",
    description: "The week's biggest moves across Africa and the markets, plus one guide worth keeping.",
  },
};

/** Where on the site a signup came from (for reporting). Unknown values are stored as "other". */
export const SIGNUP_SOURCES = ["footer", "article", "newsletter-page", "home", "section", "search", "other"] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

export const SubscribeInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email("Enter a valid email address."),
    lists: z.array(z.enum(NEWSLETTER_LISTS)).min(1, "Choose at least one newsletter.").max(NEWSLETTER_LISTS.length).default(["daily-gist"]),
    source: z
      .string()
      .max(40)
      .transform((s): SignupSource => ((SIGNUP_SOURCES as readonly string[]).includes(s) ? (s as SignupSource) : "other"))
      .default("other"),
    /** Honeypot: real people never fill this in. */
    website: z.string().max(200).optional(),
  })
  .strict();
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export type SyncStatus = "pending" | "synced" | "failed";

export interface Subscriber {
  id: string;
  email: string;
  lists: NewsletterList[];
  status: SubscriberStatus;
  source: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncAttempts: number;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface SubscriberStats {
  byStatus: Record<SubscriberStatus, number>;
  byList: Record<NewsletterList, number>;
  failedSyncs: number;
  last7Days: number;
}
