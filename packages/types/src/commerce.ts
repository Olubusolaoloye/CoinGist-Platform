import { z } from "zod";
import { INVOICE_STATUSES, SPONSORED_ORDER_STATUSES, type InvoiceStatus, type PostStatus, type SponsoredOrderStatus } from "./enums.js";

// ─── Vetting ───────────────────────────────────────────────────────────────
/** Must all be ticked before an order can be accepted (enforced in the database too). */
export const VETTING_ITEMS = [
  { key: "identity_verified", label: "Sponsor's identity and company are verified" },
  { key: "regulatory_status_checked", label: "Licence or registration checked where the product needs one" },
  { key: "no_guaranteed_returns", label: "No promise of returns, guaranteed profits or 'risk-free' claims" },
  { key: "links_scanned", label: "Every link checked against the blocked-domain list" },
  { key: "disclosure_agreed", label: "Sponsor agreed to the Sponsored label and disclosure note" },
  { key: "payment_terms_agreed", label: "Price and payment terms agreed" },
] as const;
export type VettingKey = (typeof VETTING_ITEMS)[number]["key"];
export type VettingChecklist = Partial<Record<VettingKey, boolean>>;

export function vettingComplete(c: VettingChecklist): boolean {
  return VETTING_ITEMS.every((i) => c[i.key] === true);
}

/** Order status moves the UI offers (the database enforces the same rules). */
export const ORDER_TRANSITIONS: Record<SponsoredOrderStatus, SponsoredOrderStatus[]> = {
  inquiry: ["vetting", "rejected"],
  vetting: ["accepted", "rejected"],
  rejected: ["vetting"],
  accepted: ["in_production", "rejected"],
  in_production: ["published"],
  published: [],
};

const https = z.string().trim().max(1000).regex(/^https:\/\//, "Use an https:// address");
const optional = (max: number) =>
  z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();

// ─── Sponsors ──────────────────────────────────────────────────────────────
export interface Sponsor {
  id: string;
  name: string;
  website: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: string;
}
export const SponsorInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    website: https.nullable().optional().or(z.literal("").transform(() => null)),
    contactEmail: z.string().trim().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
    notes: optional(2000),
  })
  .strict();
export type SponsorInput = z.infer<typeof SponsorInputSchema>;

// ─── Orders ────────────────────────────────────────────────────────────────
export interface SponsoredOrder {
  id: string;
  sponsor: { id: string; name: string };
  post: { id: string; title: string; status: PostStatus } | null;
  title: string;
  brief: string | null;
  amount: string | null;
  currency: string;
  vettingChecklist: VettingChecklist;
  status: SponsoredOrderStatus;
  invoiceStatus: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const amount = z
  .union([z.number(), z.string()])
  .transform((v) => (v === "" ? null : String(v)))
  .refine((v) => v === null || /^\d{1,10}(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50")
  .nullable()
  .optional();

export const OrderCreateSchema = z
  .object({
    sponsorId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    brief: optional(5000),
    amount,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").default("USD"),
  })
  .strict();
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;

export const OrderUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    brief: optional(5000),
    amount,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    vettingChecklist: z.record(z.enum(VETTING_ITEMS.map((i) => i.key) as [VettingKey, ...VettingKey[]]), z.boolean()),
    status: z.enum(SPONSORED_ORDER_STATUSES),
    invoiceStatus: z.enum(INVOICE_STATUSES),
    postId: z.string().uuid().nullable(),
    notes: optional(5000),
  })
  .partial()
  .strict();
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>;

// ─── Link safety ───────────────────────────────────────────────────────────
export interface BlockedDomain {
  domain: string;
  reason: string;
  createdAt: string;
}

/** Accepts "https://www.Scam.example/path" and stores "scam.example". */
export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#:].*$/, "");
}

export const BlockedDomainInputSchema = z
  .object({
    domain: z
      .string()
      .max(253)
      .transform(normaliseDomain)
      .refine((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d), "Enter a domain like scam-exchange.com"),
    reason: z.string().trim().min(1, "Say why it's blocked").max(300),
  })
  .strict();

export interface BlockedLink {
  host: string;
  domain: string;
  reason: string;
}

// ─── Ads ───────────────────────────────────────────────────────────────────
export interface AdSlot {
  id: string;
  key: string;
  name: string;
  placement: string;
  width: number;
  height: number;
  active: boolean;
}

export interface AdBooking {
  id: string;
  slot: { key: string; name: string };
  sponsor: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  creativeUrl: string;
  clickUrl: string;
  altText: string;
  approved: boolean;
  clicks: number;
}

export const AdBookingInputSchema = z
  .object({
    slotKey: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    sponsorId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    creativeUrl: z.string().trim().max(1000).regex(/^(https:\/\/|\/[^/])/, "Use an https:// image address"),
    clickUrl: https,
    altText: z.string().trim().min(1, "Describe the ad for screen readers").max(300),
  })
  .strict()
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), { message: "End must be after start", path: ["endsAt"] });
export type AdBookingInput = z.infer<typeof AdBookingInputSchema>;

/** What the public site needs to render one slot. */
export interface PublicAdSlot {
  key: string;
  width: number;
  height: number;
  booking: { id: string; creativeUrl: string; altText: string; sponsorName: string } | null;
}
