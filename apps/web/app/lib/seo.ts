import type { SiteConfig } from "@coingist/seo";

/** Canonical path for paginated listings: page 1 has no query, later pages keep ?page=N. */
export function pagedPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}

export type { SiteConfig };
