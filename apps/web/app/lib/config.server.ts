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
