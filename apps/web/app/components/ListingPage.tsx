import type { Paginated, PostSummary } from "@coingist/types";
import { Breadcrumbs } from "./Breadcrumbs";
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
}: {
  title: string;
  intro?: string | null;
  path: string;
  crumbs: Array<{ name: string; path: string }>;
  list: Paginated<PostSummary>;
  emptyText: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <Breadcrumbs items={crumbs} />
      <header className="mt-4 border-b-2 border-ink pb-4">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {intro ? <p className="mt-2 max-w-[60ch] text-lg text-muted">{intro}</p> : null}
      </header>
      {list.items.length > 0 ? (
        <StoryList posts={list.items} headingLevel={2} />
      ) : (
        <p className="py-10 text-lg text-muted">{emptyText}</p>
      )}
      <Pagination path={path} page={list.page} pageSize={list.pageSize} total={list.total} />
    </main>
  );
}
