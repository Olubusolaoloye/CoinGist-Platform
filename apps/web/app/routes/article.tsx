import { data, Link, redirect } from "react-router";
import { absoluteUrl, breadcrumbJsonLd, buildMeta, newsArticleJsonLd } from "@coingist/seo";
import { postPath, POST_TYPES, type PostType } from "@coingist/types";
import { readingTimeMinutes, RichText } from "@coingist/ui";
import type { Route } from "./+types/article";
import { AdSlot } from "~/components/AdSlot";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { Disclaimer } from "~/components/Disclaimer";
import { GistBox } from "~/components/GistBox";
import { NewsletterSignup } from "~/components/NewsletterSignup";
import { StoryList } from "~/components/PostCard";
import { PostImage } from "~/components/PostImage";
import { ShareBar } from "~/components/ShareBar";
import { SponsoredBadge } from "~/components/SponsoredBadge";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { formatDateTime, SECTION_LABEL } from "~/lib/format";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export async function loader({ params }: Route.LoaderArgs) {
  if (!(POST_TYPES as readonly string[]).includes(params.section)) {
    throw data(null, { status: 404 });
  }
  const post = await api.getPost(params.slug);
  // One URL per story: /gist/x requested as /news/x gets a permanent redirect.
  if (post.type !== (params.section as PostType)) throw redirect(postPath(post), 301);

  const [related, ads] = await Promise.all([
    post.category
      ? api.listPosts({ category: post.category.slug, exclude: post.id, pageSize: 4 }).then((l) => l.items)
      : Promise.resolve([]),
    // No third-party ads inside sponsored stories.
    post.isSponsored ? Promise.resolve([]) : api.ads("article"),
  ]);
  return cached({
    site: siteConfig(),
    post,
    related,
    readMinutes: readingTimeMinutes(post.body),
    articleEnd: post.isSponsored ? null : (ads.find((s) => s.key === "article-end") ?? undefined),
  });
}

function crumbs(post: Route.ComponentProps["loaderData"]["post"]) {
  const items = [{ name: "Home", path: "/" }];
  if (post.type !== "sponsored") items.push({ name: SECTION_LABEL[post.type], path: `/${post.type}` });
  if (post.category) {
    items.push({
      name: post.category.name,
      path: post.category.slug === "africa" ? "/africa" : `/category/${post.category.slug}`,
    });
  }
  return items;
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, post } = data;
  return buildMeta({
    site,
    path: postPath(post),
    canonical: post.canonical,
    type: "article",
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? post.title,
    image: post.heroImage,
    article: {
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      section: post.category?.name,
      tags: post.tags.map((t) => t.name),
      authorUrl: post.author ? absoluteUrl(site, `/author/${post.author.slug}`) : undefined,
    },
    jsonLd: [newsArticleJsonLd(site, post), breadcrumbJsonLd(site, crumbs(post))],
  });
}

export default function Article({ loaderData }: Route.ComponentProps) {
  const { site, post, related, readMinutes, articleEnd } = loaderData;
  const url = absoluteUrl(site, postPath(post));
  const updated = Date.parse(post.updatedAt) - Date.parse(post.publishedAt) > 3_600_000;

  return (
    <main className="pt-6 pb-8">
      <article className="mx-auto max-w-3xl px-4">
        <Breadcrumbs items={crumbs(post)} />

        <header className="mt-5">
          {post.isSponsored ? (
            <SponsoredBadge sponsor={post.sponsor?.name} />
          ) : post.category ? (
            <Link
              to={post.category.slug === "africa" ? "/africa" : `/category/${post.category.slug}`}
              className="text-sm font-semibold text-link hover:underline"
            >
              {post.category.name}
            </Link>
          ) : null}
          <h1 className="mt-2 font-display text-[2.1rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl">
            {post.title}
          </h1>
          {post.excerpt ? <p className="mt-4 text-xl leading-snug text-muted">{post.excerpt}</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-3 text-sm">
            <span>
              By{" "}
              {post.author ? (
                <Link to={`/author/${post.author.slug}`} className="font-semibold hover:underline">
                  {post.author.name}
                </Link>
              ) : (
                <span className="font-semibold">CoinGist Desk</span>
              )}
            </span>
            <span className="text-muted">
              Published <time dateTime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
            </span>
            {updated ? (
              <span className="text-muted">
                Updated <time dateTime={post.updatedAt}>{formatDateTime(post.updatedAt)}</time>
              </span>
            ) : null}
            <span className="text-muted">{readMinutes} min read</span>
          </div>
        </header>

        {post.isSponsored ? (
          <p className="mt-5 rounded-md border-2 border-ink p-4 text-sm">
            <strong>Sponsored content{post.sponsor ? ` from ${post.sponsor.name}` : ""}.</strong> This
            is a paid placement. The sponsor paid for this story and reviewed it before publication. It
            is not financial advice.
          </p>
        ) : null}

        {post.heroImage ? (
          <figure className="mt-6">
            <PostImage image={post.heroImage} priority sizes="(min-width: 768px) 720px, 100vw" />
          </figure>
        ) : null}

        <GistBox bullets={post.summaryBullets} heading="The gist in 30 seconds" className="mt-6" />

        <div className="article-body mt-8">
          <RichText doc={post.body} siteOrigin={site.url} sponsored={post.isSponsored} />
        </div>

        {post.aiAssisted ? (
          <p className="mt-8 text-sm text-muted">
            AI tools helped draft parts of this story. An editor reviewed and approved it before
            publication.
          </p>
        ) : null}

        {post.tags.length > 0 ? (
          <div className="mt-8">
            <h2 className="sr-only">Tags</h2>
            <ul className="flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <li key={t.slug}>
                  <Link
                    to={`/tag/${t.slug}`}
                    className="inline-block rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink"
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {articleEnd !== null ? <AdSlot slot={articleEnd} slotKey="article-end" className="mt-10" emptyPromo={false} /> : null}

        <div className="mt-8">
          <ShareBar url={url} title={post.title} />
        </div>
        <Disclaimer className="mt-4" />
        <div className="mt-10">
          <NewsletterSignup
            source="article"
            tone="boxed"
            heading="Liked this? Get the Daily Gist"
            blurb="The five crypto stories that matter today, in a two-minute read. Every weekday morning."
          />
        </div>
      </article>

      {related.length > 0 && post.category ? (
        <section className="mx-auto mt-12 max-w-3xl px-4">
          <h2 className="border-b-2 border-ink pb-2 font-display text-2xl font-extrabold tracking-tight">
            More on {post.category.name}
          </h2>
          <StoryList posts={related} />
        </section>
      ) : null}
    </main>
  );
}
