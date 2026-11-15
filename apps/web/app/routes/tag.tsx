import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/tag";
import { ListingPage } from "~/components/ListingPage";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;

export async function loader({ request, params }: Route.LoaderArgs) {
  const page = pageParam(request);
  const [tag, list] = await Promise.all([
    api.getTag(params.slug),
    api.listPosts({ tag: params.slug, page, pageSize: 12 }),
  ]);
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), tag, list });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, tag, list } = data;
  const path = `/tag/${tag.slug}`;
  return buildMeta({
    site,
    path,
    canonical: pagedPath(path, list.page),
    title: list.page > 1 ? `${tag.name}, page ${list.page}` : tag.name,
    description: `Stories tagged ${tag.name} on CoinGist.`,
    // Thin tag pages shouldn't compete with categories in search.
    noindex: list.total < 3,
    jsonLd: [
      breadcrumbJsonLd(site, [
        { name: "Home", path: "/" },
        { name: tag.name, path },
      ]),
    ],
  });
}

export default function TagPage({ loaderData }: Route.ComponentProps) {
  const { tag, list } = loaderData;
  const path = `/tag/${tag.slug}`;
  return (
    <ListingPage
      title={tag.name}
      intro={`Stories tagged ${tag.name}.`}
      path={path}
      crumbs={[
        { name: "Home", path: "/" },
        { name: tag.name, path },
      ]}
      list={list}
      emptyText={`Nothing tagged ${tag.name} yet.`}
    />
  );
}
