import { postPath, type AuthorProfile, type PostDetail } from "@coingist/types";
import { absoluteUrl, type SiteConfig } from "./site.js";

type Ld = Record<string, unknown>;

export function organizationJsonLd(site: SiteConfig): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "@id": `${site.url}/#organization`,
    name: site.name,
    url: `${site.url}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl(site, site.logo) },
    publishingPrinciples: absoluteUrl(site, "/editorial-policy"),
  };
}

export function websiteJsonLd(site: SiteConfig): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: site.name,
    url: `${site.url}/`,
    inLanguage: site.locale,
    publisher: { "@id": `${site.url}/#organization` },
  };
}

export function breadcrumbJsonLd(
  site: SiteConfig,
  items: Array<{ name: string; path: string }>,
): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(site, item.path),
    })),
  };
}

/**
 * NewsArticle for every editorial post (Google News / Top Stories eligibility).
 * Sponsored posts use schema.org's AdvertiserContentArticle so paid content is never
 * presented to search engines as journalism.
 */
export function newsArticleJsonLd(site: SiteConfig, post: PostDetail): Ld {
  const url = post.canonical ? absoluteUrl(site, post.canonical) : absoluteUrl(site, postPath(post));
  const image = absoluteUrl(site, post.heroImage?.url ?? site.defaultImage);
  return {
    "@context": "https://schema.org",
    "@type": post.isSponsored ? "AdvertiserContentArticle" : "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: post.title.length > 110 ? `${post.title.slice(0, 109)}…` : post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    image: [image],
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: post.author
      ? [
          {
            "@type": "Person",
            name: post.author.name,
            url: absoluteUrl(site, `/author/${post.author.slug}`),
          },
        ]
      : [{ "@type": "Organization", name: site.name, url: `${site.url}/` }],
    publisher: {
      "@type": "NewsMediaOrganization",
      "@id": `${site.url}/#organization`,
      name: site.name,
      logo: { "@type": "ImageObject", url: absoluteUrl(site, site.logo) },
    },
    articleSection: post.category?.name,
    keywords: post.tags.length ? post.tags.map((t) => t.name).join(", ") : undefined,
    isAccessibleForFree: true,
    inLanguage: site.locale,
    ...(post.isSponsored && post.sponsor ? { sponsor: { "@type": "Organization", name: post.sponsor.name, url: post.sponsor.website ?? undefined } } : {}),
  };
}

export function profilePageJsonLd(site: SiteConfig, author: AuthorProfile): Ld {
  const url = absoluteUrl(site, `/author/${author.slug}`);
  const sameAs = Object.values(author.socials).filter((v) => /^https?:\/\//.test(v));
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name: author.name,
      url,
      description: author.bio ?? undefined,
      image: author.avatarUrl ? absoluteUrl(site, author.avatarUrl) : undefined,
      knowsAbout: author.expertise.length ? author.expertise : undefined,
      sameAs: sameAs.length ? sameAs : undefined,
      worksFor: { "@id": `${site.url}/#organization` },
    },
  };
}
