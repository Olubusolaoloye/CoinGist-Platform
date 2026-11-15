export interface SiteConfig {
  /** Absolute origin, no trailing slash, e.g. https://coingist.com */
  url: string;
  name: string;
  description: string;
  /** Site-relative or absolute path to the default share image (1200x630). */
  defaultImage: string;
  /** Site-relative or absolute path to the publisher logo (for JSON-LD). */
  logo: string;
  /** X handle including @, optional. */
  xHandle?: string | undefined;
  locale: string;
}

export const DEFAULT_SITE: Omit<SiteConfig, "url"> = {
  name: "CoinGist",
  description:
    "Web3 and crypto news, explainers and the gist that matters — with an African lens.",
  defaultImage: "/og-default.png",
  logo: "/logo-512.png",
  locale: "en",
};

/** Resolve a site-relative path (or pass through an absolute URL). */
export function absoluteUrl(site: Pick<SiteConfig, "url">, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, `${site.url}/`).toString();
}
