import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import { EVENT_CATEGORIES, LISTING_CATEGORY_LABEL, type ListingCategory } from "@coingist/types";
import type { Route } from "./+types/events";
import { ListingsIndex, qs } from "~/components/ListingsIndex";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;
const INTRO = "Conferences, meetups and online sessions for crypto builders, investors and the curious, across Africa and beyond.";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const past = url.searchParams.get("when") === "past";
  const t = url.searchParams.get("type") ?? "";
  const type = (EVENT_CATEGORIES as readonly string[]).includes(t) ? (t as ListingCategory) : undefined;
  const page = pageParam(request);
  const list = await api.listings("event", { scope: past ? "past" : "upcoming", category: type, page, pageSize: 12 });
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), list, past, type: type ?? null });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, list, past, type } = data;
  return buildMeta({
    site,
    path: "/events",
    canonical: pagedPath("/events", list.page),
    title: past ? "Past crypto events" : "Crypto events",
    description: INTRO,
    noindex: past || !!type,
    jsonLd: [breadcrumbJsonLd(site, [{ name: "Home", path: "/" }, { name: "Events", path: "/events" }])],
  });
}

export default function Events({ loaderData }: Route.ComponentProps) {
  const { list, past, type } = loaderData;
  const when = past ? "past" : undefined;
  return (
    <ListingsIndex
      title="Events"
      intro={INTRO}
      path="/events"
      tabs={[
        { key: "upcoming", label: "Upcoming", to: `/events${qs({ type: type ?? undefined })}`, active: !past },
        { key: "past", label: "Past", to: `/events${qs({ when: "past", type: type ?? undefined })}`, active: past },
      ]}
      filters={[
        { key: "all", label: "All", to: `/events${qs({ when })}`, active: !type },
        ...EVENT_CATEGORIES.filter((c) => c !== "other").map((c) => ({
          key: c, label: LISTING_CATEGORY_LABEL[c], to: `/events${qs({ when, type: c })}`, active: type === c,
        })),
      ]}
      list={list}
      pagePath={`/events${qs({ when, type: type ?? undefined })}`}
      empty={past ? "No past events yet." : "No upcoming events right now. Check back soon."}
    />
  );
}
