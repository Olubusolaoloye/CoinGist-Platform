import { z } from "zod";
import type {
  InvoiceStatus,
  PaymentStatus,
  PostStatus,
  PostType,
  Role,
  SponsoredOrderStatus,
} from "./enums.js";
import type { StudioPostSummary } from "./studio.js";

// ─── Editor dashboard ───────────────────────────────────────────────────────

/** A story on the editorial calendar: scheduled to go out, or already published, that day. */
export interface CalendarEntry {
  id: string;
  title: string;
  type: PostType;
  status: Extract<PostStatus, "scheduled" | "published">;
  /** When it goes (or went) live. */
  at: string;
  author: { id: string; name: string | null };
}

export interface CalendarDay {
  /** YYYY-MM-DD, UTC. */
  date: string;
  entries: CalendarEntry[];
}

export interface WriterActivity {
  id: string;
  name: string | null;
  role: Role;
  drafts: number;
  inReview: number;
  changesRequested: number;
  /** Published in the last 30 days. */
  published30d: number;
  lastActiveAt: string | null;
}

export interface EditorDashboard {
  counts: Record<PostStatus, number>;
  /** Waiting for review, oldest first (excludes the viewer's own stories). */
  reviewQueue: StudioPostSummary[];
  /** Approved but not yet scheduled or published. */
  readyToSchedule: StudioPostSummary[];
  /** Drafts and changes-requested stories nobody has touched for a week. */
  stalled: StudioPostSummary[];
  calendar: { from: string; days: CalendarDay[] };
  /** Stories published per day, last 30 days (UTC), oldest first. */
  publishedByDay: Array<{ date: string; count: number }>;
  /** Stories published in the last 30 days, by section. */
  sectionMix: Array<{ type: PostType; count: number }>;
  writers: WriterActivity[];
}

export const CalendarQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real date")
    .optional(),
});

// ─── Payouts ────────────────────────────────────────────────────────────────

export interface WriterPayment {
  id: string;
  writer: { id: string; name: string | null };
  post: { id: string; title: string } | null;
  /** Decimal string, e.g. "150.00". */
  amount: string;
  currency: string;
  status: PaymentStatus;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** Published stories by staff writers that have no payment yet (cancelled ones don't count). */
export interface UnpaidStory {
  id: string;
  title: string;
  type: PostType;
  publishedAt: string;
  writer: { id: string; name: string | null };
}

export interface PayoutTotal {
  status: PaymentStatus;
  currency: string;
  amount: string;
  count: number;
}

const Amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount like 150 or 150.50")
  .refine((s) => Number(s) > 0, "The amount must be more than zero");
const Currency = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, e.g. USD or NGN"));

export const PaymentCreateSchema = z
  .object({
    writerId: z.string().uuid(),
    postId: z.string().uuid().nullable().default(null),
    amount: Amount,
    currency: Currency.default("USD"),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict();
export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>;

export const PaymentUpdateSchema = z
  .object({ status: z.enum(["approved", "paid", "cancelled"]) })
  .strict();
export type PaymentUpdateInput = z.infer<typeof PaymentUpdateSchema>;

export const PaymentListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "paid", "cancelled"]).optional(),
});

/** What a writer sees on "My earnings". */
export interface WriterEarnings {
  payments: WriterPayment[];
  totals: PayoutTotal[];
  published30d: number;
  publishedAllTime: number;
}

// ─── Admin dashboard ────────────────────────────────────────────────────────

export interface AdminDashboard {
  team: {
    byRole: Record<Role, number>;
    suspended: number;
    /** Staff accounts that haven't set up two-factor sign-in yet (they can't use Studio). */
    staffWithout2fa: Array<{ id: string; name: string | null; email: string; role: Role }>;
  };
  publishing: { published30d: number; inReview: number; scheduled: number };
  payouts: { totals: PayoutTotal[]; unpaidStories: number };
  sponsorship: {
    /** Order value by status and currency (orders without an amount are counted but not summed). */
    orders: Array<{ status: SponsoredOrderStatus; currency: string; amount: string; count: number }>;
    /** Invoices sent or overdue, by currency. */
    outstanding: Array<{ status: Extract<InvoiceStatus, "sent" | "overdue">; currency: string; amount: string; count: number }>;
  };
  ads: { live: number; liveClicks: number; awaitingApproval: number };
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
}
