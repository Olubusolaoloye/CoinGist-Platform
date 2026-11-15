// Keep these in sync with the Postgres enums in supabase/migrations.
// packages/db has a test that fails if they drift.

export const ROLES = ["reader", "writer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const POST_TYPES = ["news", "gist", "learn", "sponsored"] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const SPONSORED_ORDER_STATUSES = [
  "inquiry",
  "vetting",
  "rejected",
  "accepted",
  "in_production",
  "published",
] as const;
export type SponsoredOrderStatus = (typeof SPONSORED_ORDER_STATUSES)[number];

export const INVOICE_STATUSES = ["none", "sent", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SUBSCRIBER_STATUSES = ["pending", "active", "unsubscribed", "bounced"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "approved", "paid", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REACTION_KINDS = ["fire", "bullish", "bearish", "insightful"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
