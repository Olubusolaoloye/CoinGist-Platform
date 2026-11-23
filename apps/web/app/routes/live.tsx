import { useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import { postPath, type PostSummary } from "@coingist/types";
import type { Route } from "./+types/live";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { SponsoredBadge } from "~/components/SponsoredBadge";
import { api, cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { formatDate, SECTION_LABEL } from "~/lib/format";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

const INTRO = "Every story the moment it's published, newest first. This page updates itself every minute.";
const REFRESH_MS = 60_000;

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export async function loader() {
  const list = await api.listPosts({ pageSize: 40 });
  return cached({ site: siteConfig(), items: list.items });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/live",
    title: "Live crypto news",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Live", path: "/live" }])],
  });
}

/** "5 min ago", worked out in the browser only so server and client HTML match. */
function useAgo(iso: string, now: number | null): string | null {
  if (now === null) return null;
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : null;
}

function Entry({ post, now, fresh }: { post: PostSummary; now: number | null; fresh: boolean }) {
  const ago = useAgo(post.publishedAt, now);
  const label = post.category?.name ?? SECTION_LABEL[post.type];
  return (
    <li className="relative grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 pb-6 sm:grid-cols-[5rem_minmax(0,1fr)]">
      <div className="text-right">
        <time dateTime={post.publishedAt} className="font-display text-base font-extrabold tabular-nums">
          {timeFmt.format(new Date(post.publishedAt))}
        </time>
        <span className="block text-xs text-muted">UTC</span>
      </div>
      <div className="relative border-l-2 border-line pl-4">
        <span aria-hidden="true" className={`absolute top-1.5 -left-[7px] size-3 rounded-full border-2 border-paper ${fresh ? "bg-gist" : "bg-link"}`} />
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          {fresh ? <span className="rounded-full bg-gist px-2 py-0.5 text-gist-ink">New</span> : null}
          {post.isSponsored ? <SponsoredBadge sponsor={post.sponsorName} /> : <span className="text-link">{label}</span>}
          {ago ? <span>{ago}</span> : null}
        </p>
        <h3 className="mt-1 font-display text-lg leading-snug font-bold text-pretty">
          <Link to={postPath(post)}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p className="mt-1 line-clamp-2 text-muted">{post.excerpt}</p> : null}
      </div>
    </li>
  );
}

export default function Live({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const revalidator = useRevalidator();
  const [now, setNow] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Mark stories that arrived after the reader opened the page.
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((p) => p.id));
      return;
    }
    const arrived = items.filter((p) => !seen.current!.has(p.id)).map((p) => p.id);
    if (arrived.length) {
      arrived.forEach((id) => seen.current!.add(id));
      setFresh((prev) => new Set([...prev, ...arrived]));
    }
  }, [items]);

  // Refresh every minute while the tab is visible.
  useEffect(() => {
    setNow(Date.now());
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible" && revalidator.state === "idle") revalidator.revalidate();
    };
    const id = window.setInterval(tick, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days: Array<{ day: string; posts: PostSummary[] }> = [];
  for (const p of items) {
    const day = formatDate(p.publishedAt);
    const last = days.at(-1);
    if (last?.day === day) last.posts.push(p);
    else days.push({ day, posts: [p] });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-10">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Live", path: "/live" }]} />
      <header className="mt-4 border-b-2 border-ink pb-5">
        <h1 className="flex items-center gap-3 font-display text-[2.6rem] leading-tight font-extrabold tracking-tight sm:text-6xl">
          <span aria-hidden="true" className="relative flex size-4">
            <span className="absolute inline-flex size-full rounded-full bg-bad opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-4 rounded-full bg-bad" />
          </span>
          Live
        </h1>
        <p className="mt-2 text-lg text-muted">{INTRO}</p>
        <p role="status" className="mt-2 text-sm text-muted">
          {revalidator.state === "loading" ? "Checking for new stories…" : fresh.size ? `${fresh.size} new since you opened this page` : ""}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="mt-8 text-muted">No stories yet. Check back soon.</p>
      ) : (
        days.map((d) => (
          <section key={d.day} aria-label={d.day} className="mt-8">
            <h2 className="mb-4 inline-block rounded-full bg-ink px-3 py-1 text-sm font-semibold text-paper md:top-[8rem]">{d.day}</h2>
            <ol>
              {d.posts.map((p) => <Entry key={p.id} post={p} now={now} fresh={fresh.has(p.id)} />)}
            </ol>
          </section>
        ))
      )}
    </main>
  );
}
