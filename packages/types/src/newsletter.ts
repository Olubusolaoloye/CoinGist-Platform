import { z } from "zod";
import type { SubscriberStatus } from "./enums.js";

import { NEWSLETTER_LISTS, SIGNUP_SOURCES, type NewsletterList, type SignupSource } from "./newsletter-lists.js";

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
