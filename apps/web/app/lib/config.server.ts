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

/** Plausible analytics (privacy-friendly, no cookies). Off unless PLAUSIBLE_DOMAIN is set. */
export function analyticsConfig(): { domain: string; src: string; origin: string } | null {
  const domain = process.env["PLAUSIBLE_DOMAIN"];
  if (!domain) return null;
  const src = process.env["PLAUSIBLE_SCRIPT_URL"] ?? "https://plausible.io/js/script.js";
  return { domain, src, origin: new URL(src).origin };
}
