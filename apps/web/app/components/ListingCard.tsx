import { Link } from "react-router";
import { LISTING_CATEGORY_LABEL, listingPath, type PublicListing } from "@coingist/types";
import { formatDate, formatDateTime } from "~/lib/format";
import { Picture } from "./Picture";

const ICON: Record<string, string> = {
  event: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  opportunity: "M12 3l2.4 5.6 6.1.5-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.5z",
};

/** "12 Dec 2026" or "12–14 Dec 2026" style range for events. */
export function eventDates(l: PublicListing): string {
  if (!l.startsAt) return "";
  if (!l.endsAt || formatDate(l.endsAt) === formatDate(l.startsAt)) return formatDateTime(l.startsAt);
  return `${formatDate(l.startsAt)} to ${formatDate(l.endsAt)}`;
}

/** Ended (events) or Closed (opportunities), judged at render time. */
export function isOver(l: PublicListing, now = Date.now()): boolean {
  const end = l.kind === "event" ? (l.endsAt ?? l.startsAt) : l.endsAt;
  return !!end && Date.parse(end) < now;
}

export function ListingCard({ listing: l, compact = false }: { listing: PublicListing; compact?: boolean }) {
  const over = isOver(l);
  const meta =
    l.kind === "event"
      ? [eventDates(l), l.isOnline ? "Online" : l.location].filter(Boolean).join(" · ")
      : [l.endsAt ? `${over ? "Closed" : "Deadline"} ${formatDate(l.endsAt)}` : "No deadline", l.reward].filter(Boolean).join(" · ");
  return (
    <article className="glass relative flex h-full flex-col overflow-hidden rounded-3xl">
      {!compact ? (
        <div className="relative aspect-[16/8] overflow-hidden bg-night">
          {l.image ? (
            <Picture url={l.image.url} maxWidth={480} sizes="(min-width: 1024px) 360px, 90vw" alt={l.image.alt} width={800} height={400}
              loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div aria-hidden="true" className="placeholder-art absolute inset-0 grid place-items-center">
              <svg viewBox="0 0 24 24" className="size-12 text-gist" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d={ICON[l.kind]} />
              </svg>
            </div>
          )}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-paper">{LISTING_CATEGORY_LABEL[l.category]}</span>
          {over ? <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{l.kind === "event" ? "Ended" : "Closed"}</span> : null}
        </p>
        <h3 className="font-display text-lg leading-snug font-bold text-pretty">
          <Link to={listingPath(l)} className="after:absolute after:inset-0">{l.title}</Link>
        </h3>
        {!compact ? <p className="line-clamp-2 text-sm text-muted">{l.summary}</p> : null}
        <p className="mt-auto text-sm font-medium">{meta}</p>
      </div>
    </article>
  );
}
