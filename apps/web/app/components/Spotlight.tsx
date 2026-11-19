import { useEffect, useState } from "react";
import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { formatDate, SECTION_LABEL } from "~/lib/format";
import { Picture } from "./Picture";
import { Avatar } from "./Avatar";

function label(p: PostSummary) {
  return p.isSponsored ? "Sponsored" : (p.category?.name ?? SECTION_LABEL[p.type]);
}

function Photo({ post, priority, sizes, maxWidth }: { post: PostSummary; priority: boolean; sizes: string; maxWidth: number }) {
  if (!post.heroImage) return <div aria-hidden="true" className="placeholder-art absolute inset-0" />;
  return (
    <Picture
      url={post.heroImage.url}
      maxWidth={maxWidth}
      alt={post.heroImage.alt}
      width={1600}
      height={900}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * The home page's lead: one big photo story with a frosted caption, and the next stories peeking
 * in from the right. Readers change stories with the peeks or the coin rings; nothing moves on
 * its own.
 */
export function Spotlight({ posts }: { posts: PostSummary[] }) {
  const [active, setActive] = useState(0);
  // Hidden slides don't download their photo until needed: the first slide's photo loads with
  // the page; once the page has loaded, the next one is fetched quietly so switching is instant.
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]));
  useEffect(() => {
    setLoaded((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);
  useEffect(() => {
    const next = (active + 1) % Math.max(posts.length, 1);
    const preload = () => setLoaded((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    if (document.readyState === "complete") {
      const t = setTimeout(preload, 1500);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", preload, { once: true });
    return () => window.removeEventListener("load", preload);
  }, [active, posts.length]);
  if (posts.length === 0) return null;
  const peeks = [1, 2].map((o) => (active + o) % posts.length).filter((i, n, all) => i !== active && all.indexOf(i) === n);

  return (
    <section aria-roledescription="carousel" aria-label="Spotlight" className="pt-6 sm:pt-8">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Spotlight</h2>
        {posts.length > 1 ? (
          <div className="flex items-center gap-2" role="group" aria-label="Choose a story">
            {posts.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Story ${i + 1} of ${posts.length}: ${p.title}`}
                aria-current={i === active}
                className="group grid size-7 place-items-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={`block rounded-full border-[3px] transition-all ${
                    i === active ? "size-5 border-gist bg-transparent" : "size-3 border-muted/50 group-hover:border-ink"
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-3 sm:gap-4">
        <div className="relative isolate min-h-[26rem] min-w-0 flex-1 overflow-hidden rounded-[1.75rem] bg-night sm:min-h-[30rem] lg:min-h-[34rem]">
          {posts.map((p, i) => (
            <article
              key={p.id}
              data-active={i === active}
              aria-hidden={i !== active}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${posts.length}`}
              className="spot-slide absolute inset-0"
            >
              {loaded.has(i) ? (
                <Photo post={p} priority={i === 0} sizes="(min-width: 1024px) 760px, 100vw" maxWidth={1200} />
              ) : (
                <div aria-hidden="true" className="placeholder-art absolute inset-0" />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/20 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-5 sm:bottom-5 lg:right-auto lg:max-w-[42rem]">
                <div className="glass-photo rounded-2xl p-5 sm:p-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <span aria-hidden="true" className="size-2 rounded-full bg-gist" />
                    {label(p)}
                  </p>
                  <h3 className="mt-2 font-display text-[1.65rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-4xl">
                    <Link to={postPath(p)} tabIndex={i === active ? 0 : -1} className="hover:underline decoration-gist decoration-2 underline-offset-4">
                      {p.title}
                    </Link>
                  </h3>
                  {p.excerpt ? <p className="mt-3 line-clamp-2 max-w-[60ch] text-white/80">{p.excerpt}</p> : null}
                  <div className="mt-4 flex items-center gap-2 text-sm text-white/75">
                    <Avatar name={p.author?.name ?? "CoinGist Desk"} url={p.author?.avatarUrl} />
                    <span className="font-semibold text-white">{p.author?.name ?? "CoinGist Desk"}</span>
                    <time dateTime={p.publishedAt}>{formatDate(p.publishedAt)}</time>
                    <span className="ml-auto whitespace-nowrap">{p.readMinutes} min read</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {peeks.length ? (
          <div className="hidden gap-3 md:flex lg:gap-4">
            {peeks.map((i, n) => {
              const p = posts[i]!;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`group relative isolate overflow-hidden rounded-[1.5rem] bg-night text-left ${n === 0 ? "w-36 lg:w-44" : "w-20 lg:w-28"}`}
                  aria-label={`Show: ${p.title}`}
                >
                  <Photo post={p} priority={false} sizes="180px" maxWidth={180} />
                  <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night/80 to-night/10 transition-opacity group-hover:opacity-70" />
                  {n === 0 ? (
                    <span className="absolute inset-x-2 bottom-2 line-clamp-4 rounded-xl glass-photo p-2.5 text-sm leading-snug font-semibold">
                      {p.title}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
