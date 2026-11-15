import { redirect } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/category";
import { ListingPage } from "~/components/ListingPage";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;

/** Africa is a top-level section with its own URL; every other category lives under /category. */
const pathFor = (slug: string) => (slug === "africa" ? "/africa" : `/category/${slug}`);

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug ?? "africa";
  const url = new URL(request.url);
  if (params.slug === "africa") throw redirect(`/africa${url.search}`, 301);

  const page = pageParam(request);
  const [category, list] = await Promise.all([
    api.getCategory(slug),
    api.listPosts({ category: slug, page, pageSize: 12 }),
  ]);
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), category, list, path: pathFor(slug) });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, category, list, path } = data;
  return buildMeta({
    site,
    path,
    canonical: pagedPath(path, list.page),
    title: list.page > 1 ? `${category.name}, page ${list.page}` : `${category.name} news`,
    description: category.description ?? `The latest ${category.name} stories on CoinGist.`,
    jsonLd: [
      breadcrumbJsonLd(site, [
        { name: "Home", path: "/" },
        { name: category.name, path },
      ]),
    ],
  });
}

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
  const { category, list, path } = loaderData;
  return (
    <ListingPage
      title={category.name}
      intro={category.description}
      path={path}
      crumbs={[
        { name: "Home", path: "/" },
        { name: category.name, path },
      ]}
      list={list}
      emptyText={`No ${category.name} stories yet. Check back soon.`}
    />
  );
}
