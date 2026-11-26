import { DEFAULT_SITE, type SiteConfig } from "@coingist/seo";

/** Server-only configuration from environment variables. */
export function siteConfig(): SiteConfig {
  const url = (process.env["SITE_URL"] ?? process.env["URL"] ?? "http://localhost:5173").replace(/\/$/, "");
  return { ...DEFAULT_SITE, url, xHandle: process.env["SITE_X_HANDLE"] || undefined };
}

export function apiUrl(): string {
  // On Netlify the demo API runs on the same site under /api (see netlify/functions/api.mts).
  const fallback = process.env["URL"] ? `${process.env["URL"]}/api` : "http://localhost:8787";
  return (process.env["API_URL"] ?? fallback).replace(/\/$/, "");
}

/** Preview deploys with fictional sample content: banner on every page, never indexed. */
export function isDemo(): boolean {
  return process.env["DEMO_MODE"] === "true";
}

/**
 * Whether search engines may index this deploy. Off for demo deploys, and off while the site
 * runs on a temporary *.netlify.app address, so Google doesn't list that address and then
 * split rankings with the real domain. Turns on by itself once SITE_URL is the real domain.
 * SITE_INDEXING=on|off overrides it.
 */
export function searchIndexing(): boolean {
  if (isDemo()) return false;
  const override = process.env["SITE_INDEXING"];
  if (override === "on") return true;
  if (override === "off") return false;
  try {
    return !new URL(siteConfig().url).hostname.endsWith(".netlify.app");
  } catch {
    return false;
  }
}

/** Plausible analytics (privacy-friendly, no cookies). Off unless PLAUSIBLE_DOMAIN is set. */
export function analyticsConfig(): { domain: string; src: string; origin: string } | null {
  const domain = process.env["PLAUSIBLE_DOMAIN"];
  if (!domain) return null;
  const src = process.env["PLAUSIBLE_SCRIPT_URL"] ?? "https://plausible.io/js/script.js";
  return { domain, src, origin: new URL(src).origin };
}

/** Where readers, advertisers and data requests should write. Unset: pages say to use the About page. */
export function contactEmails(): { general: string | null; advertising: string | null } {
  const general = process.env["CONTACT_EMAIL"] || null;
  return { general, advertising: process.env["ADVERTISING_EMAIL"] || general };
}

export type AdSenseSlotKey = "home-banner" | "article-end";
export interface AdSenseConfig {
  /** Publisher ID, e.g. ca-pub-1234567890123456. */
  client: string;
  /** Ad unit ID per slot. A slot without one never shows AdSense. */
  slots: Partial<Record<AdSenseSlotKey, string>>;
}

/**
 * Google AdSense, shown only in ad slots that have no direct booking. Off unless ADSENSE_CLIENT
 * is set to a valid publisher ID; each slot also needs its ad unit ID (ADSENSE_SLOT_HOME_BANNER,
 * ADSENSE_SLOT_ARTICLE_END). Malformed values switch it off rather than break the page.
 */
export function adsenseConfig(): AdSenseConfig | null {
  const client = process.env["ADSENSE_CLIENT"]?.trim();
  if (!client || !/^ca-pub-\d{10,20}$/.test(client)) return null;
  const slots: AdSenseConfig["slots"] = {};
  const env: Record<AdSenseSlotKey, string> = { "home-banner": "ADSENSE_SLOT_HOME_BANNER", "article-end": "ADSENSE_SLOT_ARTICLE_END" };
  for (const [key, name] of Object.entries(env) as Array<[AdSenseSlotKey, string]>) {
    const id = process.env[name]?.trim();
    if (id && /^\d{6,20}$/.test(id)) slots[key] = id;
  }
  return { client, slots };
}

/** Google's hosts for AdSense ads and its consent message, allowed by the CSP only when AdSense is on. */
export const ADSENSE_HOSTS = {
  script: [
    "https://pagead2.googlesyndication.com",
    "https://partner.googleadservices.com",
    "https://tpc.googlesyndication.com",
    "https://www.googletagservices.com",
    "https://adservice.google.com",
    "https://fundingchoicesmessages.google.com",
    "https://*.adtrafficquality.google",
  ],
  frame: [
    "https://googleads.g.doubleclick.net",
    "https://tpc.googlesyndication.com",
    "https://*.googlesyndication.com",
    "https://www.google.com",
    "https://fundingchoicesmessages.google.com",
    "https://*.adtrafficquality.google",
  ],
  connect: [
    "https://pagead2.googlesyndication.com",
    "https://*.google.com",
    "https://*.adtrafficquality.google",
    "https://fundingchoicesmessages.google.com",
    "https://csi.gstatic.com",
  ],
} as const;
