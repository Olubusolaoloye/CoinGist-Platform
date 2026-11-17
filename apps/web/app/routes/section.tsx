import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/section";
import { ListingPage } from "~/components/ListingPage";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import {
  LISTABLE_SECTIONS,
  SECTION_INTRO,
  SECTION_LABEL,
  type ListableSection,
} from "~/lib/format";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;

export async function loader({ request }: Route.LoaderArgs) {
  const segment = new URL(request.url).pathname.split("/")[1] as ListableSection;
  const section = LISTABLE_SECTIONS.includes(segment) ? segment : "news";
  const page = pageParam(request);
  const list = await api.listPosts({ type: section, page, pageSize: 12 });
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), section, list });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, section, list } = data;
  const label = SECTION_LABEL[section];
  const path = `/${section}`;
  const feedLink = {
    tagName: "link" as const,
    rel: "alternate",
    type: "application/rss+xml",
    title: `${label} | CoinGist`,
    href: `/${section}/rss.xml`,
  };
  return [
    ...buildMeta({
      site,
      path,
      canonical: pagedPath(path, list.page),
      title: list.page > 1 ? `${label}, page ${list.page}` : label,
      description: SECTION_INTRO[section],
      jsonLd: [
        breadcrumbJsonLd(site, [
          { name: "Home", path: "/" },
          { name: label, path },
        ]),
      ],
    }),
    feedLink,
  ];
}

export default function Section({ loaderData }: Route.ComponentProps) {
  const { section, list } = loaderData;
  const label = SECTION_LABEL[section];
  return (
    <ListingPage
      title={label}
      intro={SECTION_INTRO[section]}
      path={`/${section}`}
      crumbs={[
        { name: "Home", path: "/" },
        { name: label, path: `/${section}` },
      ]}
      list={list}
      emptyText={`No ${label.toLowerCase()} stories yet. Check back soon.`}
    />
  );
}
