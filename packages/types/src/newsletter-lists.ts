/** Newsletter names and signup sources. No zod here: the public site ships this to browsers. */

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
