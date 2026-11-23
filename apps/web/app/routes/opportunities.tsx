import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import { LISTING_CATEGORY_LABEL, OPPORTUNITY_CATEGORIES, type ListingCategory } from "@coingist/types";
import type { Route } from "./+types/opportunities";
import { ListingsIndex, qs } from "~/components/ListingsIndex";
import { SafetyNote } from "~/components/SafetyNote";
import { api, assertPageInRange, cached, pageParam } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { pagedPath } from "~/lib/seo";

export const headers = passLoaderHeaders;
const INTRO = "Airdrops, grants, hackathons and bounties our editors have checked. We look for an official source and no requests for keys or payments.";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const closed = url.searchParams.get("when") === "closed";
  const t = url.searchParams.get("type") ?? "";
  const type = (OPPORTUNITY_CATEGORIES as readonly string[]).includes(t) ? (t as ListingCategory) : undefined;
  const page = pageParam(request);
  const list = await api.listings("opportunity", { scope: closed ? "closed" : "open", category: type, page, pageSize: 12 });
  assertPageInRange(page, list);
  return cached({ site: siteConfig(), list, closed, type: type ?? null });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, list, closed, type } = data;
  return buildMeta({
    site,
    path: "/opportunities",
    canonical: pagedPath("/opportunities", list.page),
    title: closed ? "Closed airdrops and opportunities" : "Airdrops and opportunities",
    description: INTRO,
    noindex: closed || !!type,
    jsonLd: [breadcrumbJsonLd(site, [{ name: "Home", path: "/" }, { name: "Opportunities", path: "/opportunities" }])],
  });
}

const PLURAL: Record<string, string> = { airdrop: "Airdrops", grant: "Grants", hackathon: "Hackathons", bounty: "Bounties" };

export default function Opportunities({ loaderData }: Route.ComponentProps) {
  const { list, closed, type } = loaderData;
  const when = closed ? "closed" : undefined;
  return (
    <ListingsIndex
      title="Airdrops & opportunities"
      intro={INTRO}
      path="/opportunities"
      notice={<SafetyNote className="mt-6" />}
      tabs={[
        { key: "open", label: "Open", to: `/opportunities${qs({ type: type ?? undefined })}`, active: !closed },
        { key: "closed", label: "Closed", to: `/opportunities${qs({ when: "closed", type: type ?? undefined })}`, active: closed },
      ]}
      filters={[
        { key: "all", label: "All", to: `/opportunities${qs({ when })}`, active: !type },
        ...OPPORTUNITY_CATEGORIES.filter((c) => c !== "other").map((c) => ({
          key: c, label: PLURAL[c] ?? LISTING_CATEGORY_LABEL[c], to: `/opportunities${qs({ when, type: c })}`, active: type === c,
        })),
      ]}
      list={list}
      pagePath={`/opportunities${qs({ when, type: type ?? undefined })}`}
      empty={closed ? "Nothing closed yet." : "No open opportunities right now. Check back soon."}
    />
  );
}
