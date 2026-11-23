import { absoluteUrl, breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/events.$slug";
import { eventDates } from "~/components/ListingCard";
import { ListingDetail, primaryBtn, secondaryBtn } from "~/components/ListingDetail";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export async function loader({ params }: Route.LoaderArgs) {
  return cached({ site: siteConfig(), listing: await api.listing("event", params.slug) });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { site, listing: l } = data;
  const path = `/events/${l.slug}`;
  return buildMeta({
    site,
    path,
    title: l.title,
    description: l.summary,
    image: l.image,
    jsonLd: [
      breadcrumbJsonLd(site, [{ name: "Home", path: "/" }, { name: "Events", path: "/events" }, { name: l.title, path }]),
      {
        "@context": "https://schema.org",
        "@type": "Event",
        name: l.title,
        description: l.summary,
        startDate: l.startsAt,
        ...(l.endsAt ? { endDate: l.endsAt } : {}),
        eventAttendanceMode: l.isOnline
          ? l.location ? "https://schema.org/MixedEventAttendanceMode" : "https://schema.org/OnlineEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
        location: l.isOnline && !l.location
          ? { "@type": "VirtualLocation", url: l.url }
          : { "@type": "Place", name: l.location ?? "To be announced", address: l.location ?? "To be announced" },
        ...(l.organizer ? { organizer: { "@type": "Organization", name: l.organizer, url: l.url } } : {}),
        ...(l.image ? { image: [absoluteUrl(site, l.image.url)] } : {}),
        url: absoluteUrl(site, path),
      },
    ],
  });
}

export default function EventPage({ loaderData }: Route.ComponentProps) {
  const { site, listing: l } = loaderData;
  const path = `/events/${l.slug}`;
  return (
    <ListingDetail
      listing={l}
      url={absoluteUrl(site, path)}
      crumbs={[{ name: "Home", path: "/" }, { name: "Events", path: "/events" }, { name: l.title, path }]}
      facts={[
        ["When", eventDates(l)],
        ["Where", [l.location, l.isOnline ? "Online" : null].filter(Boolean).join(" · ") || null],
        ["Organiser", l.organizer],
      ]}
      actions={
        <>
          <a href={l.url} target="_blank" rel="noopener nofollow" className={primaryBtn}>
            Official event page<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href={`/events/${l.slug}/calendar.ics`} className={secondaryBtn} download>
            Add to calendar
          </a>
        </>
      }
    />
  );
}
