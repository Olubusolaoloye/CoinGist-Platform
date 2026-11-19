import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { formatDate, SECTION_LABEL } from "~/lib/format";
import { PostImage } from "./PostImage";

/** Newest stories: the first as a wide card, the rest as compact rows with thumbnails. */
export function LatestList({ posts }: { posts: PostSummary[] }) {
  const [first, ...rest] = posts;
  if (!first) return null;
  return (
    <section aria-labelledby="latest-h" id="latest" className="scroll-mt-24">
      <h2 id="latest-h" className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Latest</h2>
      <article className="glass relative mt-4 grid overflow-hidden rounded-3xl sm:grid-cols-[1.15fr_1fr]">
        <PostImage image={first.heroImage} sizes="(min-width: 1024px) 420px, 100vw" className="w-full rounded-none sm:h-full sm:aspect-auto" />
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <p className="text-sm font-semibold text-link">{first.isSponsored ? "Sponsored" : (first.category?.name ?? SECTION_LABEL[first.type])}</p>
          <h3 className="font-display text-2xl leading-tight font-extrabold text-balance">
            <Link to={postPath(first)} className="after:absolute after:inset-0 hover:underline">{first.title}</Link>
          </h3>
          {first.excerpt ? <p className="line-clamp-3 text-muted">{first.excerpt}</p> : null}
          <p className="mt-auto text-sm text-muted">
            {first.author?.name ?? "CoinGist Desk"}, <time dateTime={first.publishedAt}>{formatDate(first.publishedAt)}</time>
          </p>
        </div>
      </article>
      {rest.length ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {rest.map((p) => (
            <li key={p.id}>
              <article className="glass relative flex h-full items-center gap-3 rounded-2xl p-2.5 pr-4">
                <PostImage image={p.heroImage} ratio="photo" sizes="112px" className="w-24 shrink-0 rounded-xl sm:w-28" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-link">{p.isSponsored ? "Sponsored" : (p.category?.name ?? SECTION_LABEL[p.type])}</p>
                  <h3 className="mt-0.5 line-clamp-3 leading-snug font-semibold">
                    <Link to={postPath(p)} className="after:absolute after:inset-0 hover:underline">{p.title}</Link>
                  </h3>
                  <time dateTime={p.publishedAt} className="mt-1 block text-xs text-muted">{formatDate(p.publishedAt)}</time>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
