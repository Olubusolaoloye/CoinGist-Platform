import { Link, useRouteLoaderData } from "react-router";
import { buildMeta, organizationJsonLd, websiteJsonLd } from "@coingist/seo";
import type { Category, PostSummary } from "@coingist/types";
import type { Route } from "./+types/home";
import { AdSlot } from "~/components/AdSlot";
import { Carousel } from "~/components/Carousel";
import { CategoryTiles, type Tile } from "~/components/CategoryTiles";
import { EditorsPicks } from "~/components/EditorsPicks";
import { FeaturedSlide } from "~/components/FeaturedSlide";
import { HomeHero } from "~/components/HomeHero";
import { NewsletterBanner } from "~/components/NewsletterBanner";
import { StoryCard } from "~/components/StoryCard";
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
    trending: latest.items.slice(0, 8),
    featured: editorial.slice(0, 4),
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

const TILE_ORDER = ["markets", "stablecoins", "bitcoin", "security", "ethereum", "regulation"];

function topicTiles(categories: Category[]): Tile[] {
  const sections: Tile[] = [
    { to: "/news", label: "News", icon: "news" },
    { to: "/gist", label: "Gist", icon: "gist" },
    { to: "/learn", label: "Learn", icon: "learn" },
    { to: "/africa", label: "Africa", icon: "africa" },
  ];
  const topics = TILE_ORDER.map((slug) => categories.find((c) => c.slug === slug))
    .filter((c): c is Category => !!c)
    .slice(0, 4)
    .map((c) => ({ to: `/category/${c.slug}`, label: c.name, icon: c.slug }));
  return [...sections, ...topics];
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { lead, leadGist, trending, featured, picks, rows, homeBanner } = loaderData;
  const root = useRouteLoaderData<{ categories: Category[] }>("root");

  if (!lead) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="font-display text-4xl font-extrabold">CoinGist</h1>
        <p className="mt-3 text-lg text-muted">No stories yet. Published stories will show up here.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-8">
      <HomeHero lead={lead} bullets={leadGist} />

      <div className="mt-8"><TrendingStrip posts={trending} /></div>

      <div id="latest" className="mt-8 grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Carousel label="Top stories" heading={<SectionTitle title="Top stories" />} itemClassName="w-full" showDots>
          {featured.map((p: PostSummary, i: number) => <FeaturedSlide key={p.id} post={p} priority={i === 0} />)}
        </Carousel>
        <div className="lg:pt-14"><EditorsPicks posts={picks} /></div>
      </div>

      <AdSlot slot={homeBanner} slotKey="home-banner" className="mt-12" />

      <div className="mt-12"><CategoryTiles tiles={topicTiles(root?.categories ?? [])} /></div>

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
