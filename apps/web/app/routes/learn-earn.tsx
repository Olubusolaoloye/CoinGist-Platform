import { Link } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { PublicListing } from "@coingist/types";
import type { Route } from "./+types/learn-earn";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { ListingCard } from "~/components/ListingCard";
import { SafetyNote } from "~/components/SafetyNote";
import { StoryCard } from "~/components/StoryCard";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { LEARN_EARN_LINKS } from "~/lib/format";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

const INTRO =
  "Learn how crypto works in plain English, then find editor-checked airdrops, grants, hackathons and events to take part in.";

const TILE_ICON: Record<string, string> = {
  "/learn": "M12 6c-2-1.5-5-2-8-1.5V18c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v13.5",
  "/opportunities": "M12 3l2.4 5.6 6.1.5-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.5z",
  "/events": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
};

export async function loader() {
  const [guides, opportunities, events] = await Promise.all([
    api.listPosts({ type: "learn", pageSize: 6 }).then((r) => r.items).catch(() => []),
    api.listingsTeaser("opportunity", 4),
    api.listingsTeaser("event", 4),
  ]);
  return cached({ site: siteConfig(), guides, opportunities, events });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/learn-earn",
    title: "Learn & Earn: crypto guides, airdrops and events",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Learn & Earn", path: "/learn-earn" }])],
  });
}

function Block({ id, title, to, linkLabel, children }: { id: string; title: string; to: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
        <Link to={to} className="shrink-0 text-sm font-semibold text-link">{linkLabel}</Link>
      </div>
      {children}
    </section>
  );
}

function Listings({ items, empty }: { items: PublicListing[]; empty: string }) {
  if (!items.length) return <p className="glass mt-4 rounded-2xl p-5 text-muted">{empty}</p>;
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((l) => <li key={l.id}><ListingCard listing={l} compact /></li>)}
    </ul>
  );
}

export default function LearnEarn({ loaderData }: Route.ComponentProps) {
  const { guides, opportunities, events } = loaderData;
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-10">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Learn & Earn", path: "/learn-earn" }]} />
      <header className="mt-4 border-b-2 border-ink pb-6">
        <h1 className="font-display text-[2.6rem] leading-tight font-extrabold tracking-tight sm:text-6xl">Learn &amp; Earn</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-muted">{INTRO}</p>
      </header>

      <nav aria-label="Learn and Earn sections" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-3">
          {LEARN_EARN_LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="glass hover-pop flex h-full items-start gap-3 rounded-2xl p-4">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gist text-gist-ink">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                    <path d={TILE_ICON[l.to]} />
                  </svg>
                </span>
                <span>
                  <span className="block font-display text-lg font-extrabold">{l.label}</span>
                  <span className="block text-sm text-muted">{l.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Block id="le-guides" title="Start learning" to="/learn" linkLabel="All guides">
        {guides.length ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((p) => <li key={p.id}><StoryCard post={p} /></li>)}
          </ul>
        ) : (
          <p className="glass mt-4 rounded-2xl p-5 text-muted">Our first guides are on the way.</p>
        )}
      </Block>

      <Block id="le-opps" title="Airdrops & opportunities" to="/opportunities" linkLabel="See all">
        <Listings items={opportunities} empty="No open opportunities right now. Check back soon." />
        <SafetyNote className="mt-4" />
      </Block>

      <Block id="le-events" title="Upcoming events" to="/events" linkLabel="All events">
        <Listings items={events} empty="No upcoming events right now. Check back soon." />
      </Block>
    </main>
  );
}
