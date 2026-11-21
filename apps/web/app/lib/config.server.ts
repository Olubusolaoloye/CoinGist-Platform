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
