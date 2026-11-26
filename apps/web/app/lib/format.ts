import type { PostType } from "@coingist/types";

// Fixed locale + time zone so server and client render identical strings (no hydration drift).
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) =>
  `${dateFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))} UTC`;

export const SECTION_LABEL: Record<PostType, string> = {
  news: "News",
  gist: "Gist",
  learn: "Learn",
  sponsored: "Sponsored",
};

export const SECTION_INTRO: Record<"news" | "gist" | "learn", string> = {
  news: "What's moving in crypto and Web3, reported with an African lens.",
  gist: "The story in a few lines. Read it in under a minute.",
  learn: "Plain-English guides for getting started and staying safe.",
};

export const LISTABLE_SECTIONS = ["news", "gist", "learn"] as const;
export type ListableSection = (typeof LISTABLE_SECTIONS)[number];

/** Topics kept as pages (old links still work) but left out of menus to keep navigation short. */
export const HIDDEN_NAV_TOPICS: readonly string[] = ["africa", "regulation"];

/** The Learn & Earn group: guides, then vetted ways to earn or take part. */
export const LEARN_EARN_LINKS = [
  { to: "/learn", label: "Learn crypto", blurb: "Plain-English guides to get started and stay safe" },
  { to: "/opportunities", label: "Airdrops & opportunities", blurb: "Editor-checked airdrops, grants, hackathons, bounties" },
  { to: "/events", label: "Events", blurb: "Conferences, meetups and online sessions" },
] as const;
export const LEARN_EARN_PATHS = ["/learn-earn", ...LEARN_EARN_LINKS.map((l) => l.to)];
export const inLearnEarn = (pathname: string) =>
  LEARN_EARN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
