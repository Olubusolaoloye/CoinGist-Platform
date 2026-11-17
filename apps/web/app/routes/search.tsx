import { Form, useNavigation } from "react-router";
import { buildMeta } from "@coingist/seo";
import type { Paginated, PostSummary } from "@coingist/types";
import type { Route } from "./+types/search";
import { Pagination } from "~/components/Pagination";
import { StoryList } from "~/components/PostCard";
import { api } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.min(50, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const results: Paginated<PostSummary> | null = q ? await api.listPosts({ q, page, pageSize: 12 }) : null;
  return { site: siteConfig(), q, results };
}

// Searches are personal and endless: don't index them, and let the CDN keep them briefly only.
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=30", "X-Robots-Tag": "noindex, follow" };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/search",
    title: data.q ? `Search: ${data.q}` : "Search",
    description: "Search CoinGist stories, gists and guides.",
    noindex: true,
  });
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { q, results } = loaderData;
  const searching = useNavigation().state === "loading";
  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-8">
      <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">Search</h1>
      <Form method="get" role="search" className="mt-5 flex gap-2">
        <label htmlFor="q" className="sr-only">Search CoinGist</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          autoFocus={!q}
          placeholder="Try stablecoins, P2P or Kenya"
          className="min-h-12 w-full rounded-full border border-line bg-surface px-5 text-lg text-ink placeholder:text-muted"
        />
        <button className="min-h-12 shrink-0 rounded-full bg-ink px-6 font-semibold text-paper hover:opacity-90" disabled={searching}>
          Search
        </button>
      </Form>

      {results ? (
        <section aria-labelledby="results-h" className="mt-8">
          <h2 id="results-h" className="text-sm font-semibold text-muted" aria-live="polite">
            {results.total === 0
              ? `No stories match "${q}". Try a shorter or different word.`
              : `${results.total} ${results.total === 1 ? "story" : "stories"} for "${q}"`}
          </h2>
          <StoryList posts={results.items} headingLevel={3} />
          <Pagination path={`/search?q=${encodeURIComponent(q)}`} page={results.page} pageSize={results.pageSize} total={results.total} />
        </section>
      ) : null}
    </main>
  );
}
