import { buildMeta, organizationJsonLd, websiteJsonLd } from "@coingist/seo";
import type { Route } from "./+types/home";
import { GistBox } from "~/components/GistBox";
import { LeadStory, StoryList, StoryTile } from "~/components/PostCard";
import { SectionHeading } from "~/components/SectionHeading";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export async function loader() {
  const [latest, news, gist, learn, africa] = await Promise.all([
    api.listPosts({ pageSize: 10 }),
    api.listPosts({ type: "news", pageSize: 4 }),
    api.listPosts({ type: "gist", pageSize: 4 }),
    api.listPosts({ type: "learn", pageSize: 3 }),
    api.listPosts({ category: "africa", pageSize: 4 }),
  ]);
  const lead = latest.items.find((p) => !p.isSponsored) ?? null;
  const leadDetail = lead ? await api.getPost(lead.slug) : null;
  const rest = latest.items.filter((p) => p.id !== lead?.id).slice(0, 6);
  return cached({
    site: siteConfig(),
    lead,
    leadGist: leadDetail?.summaryBullets ?? [],
    latest: rest,
    news: news.items.filter((p) => p.id !== lead?.id).slice(0, 3),
    gist: gist.items,
    learn: learn.items,
    africa: africa.items,
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

export default function Home({ loaderData }: Route.ComponentProps) {
  const { lead, leadGist, latest, news, gist, learn, africa } = loaderData;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-8">
      <h1 className="sr-only">CoinGist: crypto news with an African lens</h1>

      {lead ? (
        <section aria-label="Top story" className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <LeadStory post={lead} />
          <div className="space-y-6">
            <GistBox bullets={leadGist} heading="The gist in 30 seconds" />
            <div>
              <SectionHeading title="Latest" />
              <StoryList posts={latest} showImages={false} />
            </div>
          </div>
        </section>
      ) : (
        <p className="py-16 text-lg text-muted">No stories yet. Published stories will show up here.</p>
      )}

      {news.length > 0 ? (
        <section className="mt-14">
          <SectionHeading title="News" to="/news" />
          <div className="mt-5 grid gap-8 md:grid-cols-3">
            {news.map((p) => (
              <StoryTile key={p.id} post={p} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        {gist.length > 0 ? (
          <section>
            <SectionHeading title="Gist" to="/gist" linkLabel="More gist" />
            <StoryList posts={gist} />
          </section>
        ) : null}
        {africa.length > 0 ? (
          <section>
            <SectionHeading title="Africa" to="/africa" linkLabel="More from Africa" />
            <StoryList posts={africa} />
          </section>
        ) : null}
      </div>

      {learn.length > 0 ? (
        <section className="mt-14">
          <SectionHeading title="Learn" to="/learn" linkLabel="All guides" />
          <div className="mt-5 grid gap-8 md:grid-cols-3">
            {learn.map((p) => (
              <StoryTile key={p.id} post={p} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
