import type { ReactNode } from "react";
import { LISTING_CATEGORY_LABEL, type PublicListing } from "@coingist/types";
import { formatDate } from "~/lib/format";
import { Breadcrumbs } from "./Breadcrumbs";
import { isOver } from "./ListingCard";
import { Picture } from "./Picture";
import { ShareBar } from "./ShareBar";

/** Shared page for one event or opportunity. */
export function ListingDetail({
  listing: l, url, crumbs, facts, actions, children,
}: {
  listing: PublicListing;
  url: string;
  crumbs: Array<{ name: string; path: string }>;
  facts: Array<[string, ReactNode]>;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const over = isOver(l);
  const paragraphs = l.details.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-10">
      <Breadcrumbs items={crumbs} />
      <header className="mt-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="rounded-full bg-ink px-3 py-1 text-paper">{LISTING_CATEGORY_LABEL[l.category]}</span>
          {over ? <span className="rounded-full border border-line px-3 py-1 text-muted">{l.kind === "event" ? "This event has ended" : "Closed"}</span> : null}
        </p>
        <h1 className="mt-3 font-display text-[2.2rem] leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">{l.title}</h1>
        <p className="mt-3 text-lg text-muted">{l.summary}</p>
      </header>
      {l.image ? (
        <div className="mt-6 overflow-hidden rounded-3xl bg-night">
          <Picture url={l.image.url} maxWidth={760} sizes="(min-width: 800px) 760px, 100vw" alt={l.image.alt} width={1200} height={630}
            loading="eager" fetchPriority="high" className="block h-auto w-full" />
        </div>
      ) : null}
      <dl className="glass mt-6 grid gap-x-6 gap-y-3 rounded-3xl p-5 sm:grid-cols-2">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">{actions}</div>
      {children}
      {paragraphs.length ? (
        <div className="article-body mt-8">
          {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </div>
      ) : null}
      {l.publishedAt ? <p className="mt-8 text-sm text-muted">Listed {formatDate(l.publishedAt)}</p> : null}
      <div className="mt-6"><ShareBar url={url} title={l.title} /></div>
    </main>
  );
}

export const primaryBtn = "inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-paper";
export const secondaryBtn = "inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 font-semibold hover:border-ink";
