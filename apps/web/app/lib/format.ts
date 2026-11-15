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
