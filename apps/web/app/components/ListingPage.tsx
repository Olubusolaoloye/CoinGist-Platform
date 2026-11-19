import type { ReactNode } from "react";
import type { ImageRef, Paginated, PostSummary } from "@coingist/types";
import { Breadcrumbs } from "./Breadcrumbs";
import { NewsletterBanner } from "./NewsletterBanner";
import { Pagination } from "./Pagination";
import { StoryList } from "./PostCard";

/** Shared layout for section, category and tag listings. */
export function ListingPage({
  title,
  intro,
  path,
  crumbs,
  list,
  emptyText,
  action,
  cover,
}: {
  title: string;
  intro?: string | null;
  path: string;
  crumbs: Array<{ name: string; path: string }>;
  list: Paginated<PostSummary>;
  emptyText: string;
  /** e.g. a Follow button beside the title. */
  action?: ReactNode;
  /** Topic cover image (set by admins in Studio). */
  cover?: ImageRef | null;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <Breadcrumbs items={crumbs} />
      {cover ? (
        <header className="relative isolate mt-4 overflow-hidden rounded-[1.75rem] bg-night">
          <img src={cover.url} alt={cover.alt} className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent" />
          <div className="relative flex min-h-[15rem] items-end p-3 sm:min-h-[18rem] sm:p-4">
            <div className="glass-photo w-full rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-[2.2rem] leading-tight font-extrabold tracking-tight sm:text-5xl">{title}</h1>
                <div className="rounded-full bg-paper text-ink">{action}</div>
              </div>
              {intro ? <p className="mt-1 max-w-[60ch] text-white/85">{intro}</p> : null}
            </div>
          </div>
        </header>
      ) : (
        <header className="glass mt-4 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">
              {title}
            </h1>
            {action}
          </div>
          {intro ? <p className="mt-2 max-w-[60ch] text-lg text-muted">{intro}</p> : null}
        </header>
      )}
      {list.items.length > 0 ? (
        <StoryList posts={list.items} headingLevel={2} />
      ) : (
        <p className="py-10 text-lg text-muted">{emptyText}</p>
      )}
      <Pagination path={path} page={list.page} pageSize={list.pageSize} total={list.total} />
      <div className="mt-12"><NewsletterBanner source="section" /></div>
    </main>
  );
}
