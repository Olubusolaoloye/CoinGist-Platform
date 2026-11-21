import { data, Link, useRouteLoaderData } from "react-router";
import { FOLLOW_TYPE_LABEL, postPath } from "@coingist/types";
import type { Route } from "./+types/for-you";
import { Pagination } from "~/components/Pagination";
import { PostImage } from "~/components/PostImage";
import { FollowButton } from "~/components/ReaderButtons";
import { SponsoredBadge } from "~/components/SponsoredBadge";
import { pageParam } from "~/lib/api.server";
import { formatDate } from "~/lib/format";
import { privateHeaders } from "~/lib/private.server";
import { withReader } from "~/lib/reader.server";
import type { loader as rootLoader } from "~/root";

export const headers = ({ loaderHeaders }: Route.HeadersArgs) => loaderHeaders;

export function meta() {
  return [{ title: "For you | CoinGist" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const page = pageParam(request);
  return withReader(request, async (api, auth) => data({ feed: await api.feed(page) }, { headers: privateHeaders(auth.headers) }));
}

const WHY = { author: "you follow", category: "you follow", tag: "you follow" } as const;

export default function ForYou({ loaderData }: Route.ComponentProps) {
  const { feed } = loaderData;
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const topics = (root?.categories ?? []).slice(0, 8);
  const followed = new Set(feed.follows.map((f) => `${f.type}:${f.slug}`));

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-10">
      <header className="border-b-2 border-ink pb-4">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">For you</h1>
        <p className="mt-2 text-lg text-muted">New stories from the writers and topics you follow, newest first.</p>
        {feed.follows.length ? (
          <p className="mt-3 text-sm">
            Following: {feed.follows.map((f) => f.name).join(", ")} · <Link to="/account" className="font-semibold text-link underline">Manage</Link>
          </p>
        ) : null}
      </header>

      {feed.follows.length === 0 || feed.total === 0 ? (
        <section aria-labelledby="start-h" className="mt-8">
          <h2 id="start-h" className="font-display text-2xl font-extrabold tracking-tight">
            {feed.follows.length === 0 ? "Follow a few topics to start your feed" : "Nothing new from what you follow yet"}
          </h2>
          <p className="mt-2 text-muted">You can also follow writers from their profile and tags from any story.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {topics.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <Link to={c.slug === "africa" ? "/africa" : `/category/${c.slug}`} className="font-semibold">{c.name}</Link>
                {followed.has(`category:${c.slug}`) ? <span className="text-sm text-muted">Following</span> : <FollowButton type="category" slug={c.slug} name={c.name} />}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <ol className="mt-4 divide-y divide-line">
          {feed.items.map((s) => (
            <li key={s.id} className="relative grid grid-cols-[minmax(0,1fr)_7rem] gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div>
                {s.isSponsored ? <SponsoredBadge sponsor={s.sponsorName} /> : null}
                <p className="text-sm font-semibold text-link">
                  {FOLLOW_TYPE_LABEL[s.because.type]}: {s.because.name}
                  <span className="sr-only"> ({WHY[s.because.type]})</span>
                </p>
                <h2 className="mt-1 font-display text-xl leading-snug font-bold">
                  <Link to={postPath(s)} className="after:absolute after:inset-0">{s.title}</Link>
                </h2>
                {s.excerpt ? <p className="mt-1 line-clamp-2 text-muted">{s.excerpt}</p> : null}
                <p className="mt-1 text-sm text-muted">{s.author?.name ?? "CoinGist"} · {formatDate(s.publishedAt)} · {s.readMinutes} min read</p>
              </div>
              <PostImage image={s.heroImage} sizes="9rem" className="w-full" />
            </li>
          ))}
        </ol>
      )}
      <Pagination path="/for-you" page={feed.page} pageSize={feed.pageSize} total={feed.total} />
    </main>
  );
}
