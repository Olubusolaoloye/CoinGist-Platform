import { absoluteUrl, breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/opportunities.$slug";
import { isOver } from "~/components/ListingCard";
import { ListingDetail, primaryBtn } from "~/components/ListingDetail";
import { SafetyNote } from "~/components/SafetyNote";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { formatDate, formatDateTime } from "~/lib/format";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export async function loader({ params }: Route.LoaderArgs) {
  return cached({ site: siteConfig(), listing: await api.listing("opportunity", params.slug) });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, listing: l } = data;
  const path = `/opportunities/${l.slug}`;
  return buildMeta({
    site,
    path,
    title: l.title,
    description: l.summary,
    image: l.image,
    // Closed opportunities stay readable but drop out of search.
    noindex: isOver(l),
    jsonLd: [breadcrumbJsonLd(site, [{ name: "Home", path: "/" }, { name: "Opportunities", path: "/opportunities" }, { name: l.title, path }])],
  });
}

export default function OpportunityPage({ loaderData }: Route.ComponentProps) {
  const { site, listing: l } = loaderData;
  const path = `/opportunities/${l.slug}`;
  const over = isOver(l);
  return (
    <ListingDetail
      listing={l}
      url={absoluteUrl(site, path)}
      crumbs={[{ name: "Home", path: "/" }, { name: "Opportunities", path: "/opportunities" }, { name: l.title, path }]}
      facts={[
        ["Deadline", l.endsAt ? formatDateTime(l.endsAt) : "No deadline given"],
        ["Reward", l.reward],
        ["Who can take part", l.location],
        ["From", l.organizer],
      ]}
      actions={
        over ? (
          <p className="font-semibold text-muted">This opportunity has closed.</p>
        ) : (
          <a href={l.url} target="_blank" rel="noopener nofollow" className={primaryBtn}>
            Go to the official page<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )
      }
    >
      <SafetyNote className="mt-6" />
      {l.checkedAt ? <p className="mt-2 text-sm text-muted">Checked by the CoinGist editors on {formatDate(l.checkedAt)}.</p> : null}
    </ListingDetail>
  );
}
