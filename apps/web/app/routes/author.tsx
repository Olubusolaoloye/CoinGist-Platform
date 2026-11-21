import { breadcrumbJsonLd, buildMeta, profilePageJsonLd } from "@coingist/seo";
import { fixedImage } from "~/lib/image";
import { safeHref } from "@coingist/ui";
import type { Route } from "./+types/author";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { Pagination } from "~/components/Pagination";
import { StoryList } from "~/components/PostCard";
import { FollowButton } from "~/components/ReaderButtons";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;

const SOCIAL_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  website: "Website",
  github: "GitHub",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const page = pageParam(request);
  const [author, list] = await Promise.all([
    api.getAuthor(params.slug),
    api.listPosts({ author: params.slug, page, pageSize: 12 }),
  ]);
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), author, list });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, author, list } = data;
  const path = `/author/${author.slug}`;
  return buildMeta({
    site,
    path,
    canonical: pagedPath(path, list.page),
    type: "profile",
    title: list.page > 1 ? `${author.name}, page ${list.page}` : `${author.name}, CoinGist`,
    appendSiteName: false,
    description: author.bio ?? `Stories by ${author.name} on CoinGist.`,
    image: author.avatarUrl ? { url: author.avatarUrl, alt: author.name } : null,
    jsonLd: [
      profilePageJsonLd(site, author),
      breadcrumbJsonLd(site, [
        { name: "Home", path: "/" },
        { name: author.name, path },
      ]),
    ],
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AuthorPage({ loaderData }: Route.ComponentProps) {
  const { author, list } = loaderData;
  const path = `/author/${author.slug}`;
  const socials = Object.entries(author.socials)
    .map(([k, v]) => [k, safeHref(v)] as const)
    .filter((e): e is readonly [string, string] => e[1] !== null && !e[1].startsWith("/"));

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: author.name, path }]} />
      <header className="mt-5 flex flex-col gap-5 border-b-2 border-ink pb-6 sm:flex-row sm:items-start">
        {author.avatarUrl ? (
          <img
            src={fixedImage(author.avatarUrl, 96)}
            alt=""
            width={96}
            height={96}
            className="size-24 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-24 shrink-0 items-center justify-center rounded-full bg-gist font-display text-3xl font-extrabold text-gist-ink"
          >
            {initials(author.name)}
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight">{author.name}</h1>
            <FollowButton type="author" slug={author.slug} name={author.name} />
          </div>
          {author.title ? <p className="mt-1 font-semibold text-muted">{author.title}</p> : null}
          {author.bio ? <p className="mt-2 max-w-[60ch] text-lg text-muted">{author.bio}</p> : null}
          {author.expertise.length > 0 ? (
            <div className="mt-3">
              <h2 className="sr-only">Covers</h2>
              <ul className="flex flex-wrap gap-2">
                {author.expertise.map((e) => (
                  <li key={e} className="rounded-full border border-line px-3 py-1 text-sm">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {socials.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-4 text-sm">
              {socials.map(([k, href]) => (
                <li key={k}>
                  <a href={href} rel="me noopener noreferrer" target="_blank" className="font-medium text-link">
                    {SOCIAL_LABEL[k] ?? k}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <section className="mt-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Stories by {author.name}</h2>
        {list.items.length > 0 ? (
          <StoryList posts={list.items} />
        ) : (
          <p className="py-8 text-muted">{author.name} hasn't published any stories yet.</p>
        )}
        <Pagination path={path} page={list.page} pageSize={list.pageSize} total={list.total} />
      </section>
    </main>
  );
}
