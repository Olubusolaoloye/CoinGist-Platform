import { z } from "zod";

export const LISTING_KINDS = ["event", "opportunity"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const EVENT_CATEGORIES = ["conference", "meetup", "online", "other"] as const;
export const OPPORTUNITY_CATEGORIES = ["airdrop", "grant", "hackathon", "bounty", "other"] as const;
export type ListingCategory = (typeof EVENT_CATEGORIES)[number] | (typeof OPPORTUNITY_CATEGORIES)[number];

export const LISTING_CATEGORY_LABEL: Record<ListingCategory, string> = {
  conference: "Conference",
  meetup: "Meetup",
  online: "Online event",
  airdrop: "Airdrop",
  grant: "Grant",
  hackathon: "Hackathon",
  bounty: "Bounty",
  other: "Other",
};

/** An event or opportunity as readers see it. */
export interface PublicListing {
  id: string;
  kind: ListingKind;
  category: ListingCategory;
  title: string;
  slug: string;
  summary: string;
  details: string;
  url: string;
  image: { url: string; alt: string } | null;
  organizer: string | null;
  /** Events: start. */
  startsAt: string | null;
  /** Events: end. Opportunities: deadline. */
  endsAt: string | null;
  location: string | null;
  isOnline: boolean;
  reward: string | null;
  /** When an editor confirmed the safety checklist (opportunities). */
  checkedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** The same, plus what Studio needs. */
export interface StudioListing extends PublicListing {
  status: "draft" | "published";
  safetyChecked: boolean;
  createdBy: string | null;
}

/** Things an editor confirms before an opportunity can go live. */
export const OPPORTUNITY_SAFETY_CHECKS = [
  "The link is the project's official site or announcement (checked against its verified social accounts).",
  "Taking part never asks for a seed phrase, private key or wallet password.",
  "No upfront payment or deposit is required to qualify.",
  "The project and team are real and identifiable.",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const isoOrEmpty = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date")
  .transform((v) => (v ? new Date(v).toISOString() : null));

export const ListingInputSchema = z
  .object({
    kind: z.enum(LISTING_KINDS),
    category: z.enum(["conference", "meetup", "online", "airdrop", "grant", "hackathon", "bounty", "other"]),
    title: z.string().trim().min(3, "Add a title").max(160),
    summary: z.string().trim().min(10, "Add a one- or two-sentence summary").max(400),
    details: z.string().trim().max(6000).default(""),
    url: z.string().trim().max(1000).regex(/^https:\/\/[^\s]+$/, "Use the official https:// link"),
    imageUrl: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .refine((v) => !v || /^(https:\/\/|\/[^/])/.test(v), "Use an https:// image address")
      .transform((v) => (v ? v : null)),
    imageAlt: optionalText(300),
    organizer: optionalText(160),
    startsAt: isoOrEmpty,
    endsAt: isoOrEmpty,
    location: optionalText(160),
    isOnline: z.boolean().default(false),
    reward: optionalText(200),
    status: z.enum(["draft", "published"]).default("draft"),
    safetyChecked: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ok = v.kind === "event" ? ["conference", "meetup", "online", "other"] : ["airdrop", "grant", "hackathon", "bounty", "other"];
    if (!ok.includes(v.category)) ctx.addIssue({ code: "custom", path: ["category"], message: "Pick a type that fits" });
    if (v.kind === "event" && !v.startsAt) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Events need a start date" });
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) < Date.parse(v.startsAt))
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end can't be before the start" });
    if (v.imageUrl && !v.imageAlt) ctx.addIssue({ code: "custom", path: ["imageAlt"], message: "Describe the image" });
  });
export type ListingInput = z.infer<typeof ListingInputSchema>;

export const LISTING_SCOPES = ["upcoming", "past", "open", "closed"] as const;
export type ListingScope = (typeof LISTING_SCOPES)[number];

export const listingPath = (l: { kind: ListingKind; slug: string }) => `/${l.kind === "event" ? "events" : "opportunities"}/${l.slug}`;
