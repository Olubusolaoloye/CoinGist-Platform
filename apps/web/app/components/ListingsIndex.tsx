import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Paginated, PublicListing } from "@coingist/types";
import { Breadcrumbs } from "./Breadcrumbs";
import { ListingCard } from "./ListingCard";
import { Pagination } from "./Pagination";

type Tab = { key: string; label: string; to: string; active: boolean };

/** Shared layout for /events and /opportunities: tabs, type filters, a card grid, pagination. */
export function ListingsIndex({
  title, intro, path, tabs, filters, list, pagePath, empty, notice,
}: {
  title: string;
  intro: string;
  path: string;
  tabs: Tab[];
  filters: Tab[];
  list: Paginated<PublicListing>;
  pagePath: string;
  empty: string;
  notice?: ReactNode;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`;
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-10">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: title, path }]} />
      <header className="mt-4 border-b-2 border-ink pb-5">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-muted">{intro}</p>
      </header>
      {notice}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={`${title}: when`} className="flex gap-2">
          {tabs.map((t) => <Link key={t.key} to={t.to} aria-current={t.active ? "page" : undefined} className={chip(t.active)}>{t.label}</Link>)}
        </nav>
        <nav aria-label={`${title}: type`} className="flex flex-wrap gap-2">
          {filters.map((t) => <Link key={t.key} to={t.to} aria-current={t.active ? "page" : undefined} className={chip(t.active)}>{t.label}</Link>)}
        </nav>
      </div>
      {list.items.length === 0 ? (
        <p className="mt-10 text-muted">{empty}</p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}
        </ul>
      )}
      <Pagination path={pagePath} page={list.page} pageSize={list.pageSize} total={list.total} />
    </main>
  );
}

/** Builds a query string from the given values, leaving out empty ones. */
export function qs(values: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
