import { DEFAULT_SITE, type SiteConfig } from "@coingist/seo";

/** Server-only configuration from environment variables. */
export function siteConfig(): SiteConfig {
  const url = (process.env["SITE_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
  return { ...DEFAULT_SITE, url, xHandle: process.env["SITE_X_HANDLE"] || undefined };
}

export function apiUrl(): string {
  return (process.env["API_URL"] ?? "http://localhost:8787").replace(/\/$/, "");
}
