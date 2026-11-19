import { Link, useRouteLoaderData } from "react-router";
import { buildMeta, organizationJsonLd, websiteJsonLd } from "@coingist/seo";
import { postPath, type Category, type PostSummary, type PriceTicker } from "@coingist/types";
import type { Route } from "./+types/home";
import { AdSlot } from "~/components/AdSlot";
import { Carousel } from "~/components/Carousel";
import { EditorsPicks } from "~/components/EditorsPicks";
import { LatestList } from "~/components/LatestList";
import { MarketsPanel } from "~/components/MarketsPanel";
import { NewsletterBanner } from "~/components/NewsletterBanner";
import { Spotlight } from "~/components/Spotlight";
import { StoryCard } from "~/components/StoryCard";
import { TopicTiles } from "~/components/TopicTiles";
import { TrendingStrip } from "~/components/TrendingStrip";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export async function loader() {
  const [latest, picks, news, gist, learn, africa, ads] = await Promise.all([
    api.listPosts({ pageSize: 12 }),
    api.listPosts({ featured: true, pageSize: 5 }),
    api.listPosts({ type: "news", pageSize: 8 }),
    api.listPosts({ type: "gist", pageSize: 8 }),
    api.listPosts({ type: "learn", pageSize: 8 }),
    api.listPosts({ category: "africa", pageSize: 8 }),
    api.ads("home"),
  ]);
  const editorial = latest.items.filter((p) => !p.isSponsored);
  const lead = editorial[0] ?? null;
  const leadDetail = lead ? await api.getPost(lead.slug) : null;
  return cached({
    site: siteConfig(),
    lead,
    leadGist: leadDetail?.summaryBullets ?? [],
    latest: latest.items,
    spotlight: editorial.slice(0, 5),
    picks: picks.items,
    rows: [
      { key: "news", title: "Latest news", to: "/news", posts: news.items },
      { key: "gist", title: "The gist", to: "/gist", posts: gist.items },
      { key: "learn", title: "Learn", to: "/learn", posts: learn.items },
      { key: "africa", title: "Across Africa", to: "/africa", posts: africa.items },
    ],
    homeBanner: ads.find((s) => s.key === "home-banner"),
  });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/",
    title: "CoinGist: crypto news with an African lens",
    appendSiteName: false,
    description: data.site.description,
    jsonLd: [organizationJsonLd(data.site), websiteJsonLd(data.site)],
  });
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { lead, leadGist, latest, spotlight, picks, rows, homeBanner } = loaderData;
  const root = useRouteLoaderData<{ categories: Category[]; prices: PriceTicker | null }>("root");

  if (!lead) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <section className="glass relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
          <svg aria-hidden="true" viewBox="0 0 120 120" className="pointer-events-none absolute -top-10 -right-10 size-56 text-gist opacity-60">
            <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="16" />
          </svg>
          <h1 className="max-w-[18ch] font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
            Crypto news with an African lens
          </h1>
          <p className="mt-4 max-w-[52ch] text-lg text-muted">
            Our first stories are being edited now. Get them in your inbox the morning they go live.
          </p>
          <Link to="/newsletter" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-gist px-6 font-bold text-gist-ink hover:opacity-90">
            Get the Daily Gist
          </Link>
        </section>
        <div className="mt-10"><MarketsPanel ticker={root?.prices ?? null} /></div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-8">
      <Spotlight posts={spotlight} />

      <div className="mt-6"><TrendingStrip posts={latest.slice(0, 8)} /></div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <LatestList posts={latest.filter((p) => !spotlight.some((s) => s.id === p.id)).slice(0, 7)} />
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start" aria-label="Markets and highlights">
          <MarketsPanel ticker={root?.prices ?? null} />
          {leadGist.length ? <GistCard lead={lead} bullets={leadGist} /> : null}
          <EditorsPicks posts={picks} />
        </aside>
      </div>

      <AdSlot slot={homeBanner} slotKey="home-banner" className="mt-12" />

      <div className="mt-14"><TopicTiles categories={(root?.categories ?? []).slice(0, 7)} /></div>

      {rows
        .filter((r) => r.posts.length > 0)
        .map((r) => (
          <Carousel
            key={r.key}
            label={r.title}
            className="mt-14"
            heading={<SectionTitle title={r.title} />}
            action={<Link to={r.to} className="mr-2 hidden text-sm font-semibold text-link hover:underline sm:inline">See all</Link>}
            itemClassName="w-[82%] sm:w-[46%] lg:w-[31.5%]"
          >
            {r.posts.map((p: PostSummary) => <StoryCard key={p.id} post={p} />)}
          </Carousel>
        ))}

      <div className="mt-16"><NewsletterBanner source="home" /></div>
    </main>
  );
}

/** Today's top story in 30 seconds, on danfo yellow. */
function GistCard({ lead, bullets }: { lead: PostSummary; bullets: string[] }) {
  return (
    <section aria-labelledby="todays-gist" className="relative overflow-hidden rounded-3xl bg-gist p-5 text-gist-ink">
      <svg aria-hidden="true" viewBox="0 0 120 120" className="pointer-events-none absolute -top-8 -right-8 size-32 opacity-25">
        <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="14" />
      </svg>
      <h2 id="todays-gist" className="font-display text-lg font-extrabold">Today's gist in 30 seconds</h2>
      <p className="mt-2 font-display text-xl leading-tight font-extrabold text-balance">
        <Link to={postPath(lead)} className="hover:underline">{lead.title}</Link>
      </p>
      <ul className="mt-3 space-y-2 text-[0.95rem]">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-gist-ink" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
