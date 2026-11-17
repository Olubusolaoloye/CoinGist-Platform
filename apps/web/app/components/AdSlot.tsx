import { Link } from "react-router";
import type { PublicAdSlot } from "@coingist/types";
import { track } from "~/lib/analytics";

/**
 * Fixed-ratio boxes per slot. Static class names (Tailwind only generates classes it can see),
 * and no inline styles, which the CSP blocks.
 */
const RATIO: Record<string, string> = {
  "home-banner": "aspect-[1200/250]",
  "article-end": "aspect-[3/1]",
};

/**
 * A reserved ad slot. A live booking shows the sponsor's creative (clearly labelled, links via
 * a counting redirect, rel="sponsored"); an empty slot shows a newsletter promo or nothing.
 */
export function AdSlot({
  slot,
  slotKey,
  className = "",
  emptyPromo = true,
}: {
  slot: PublicAdSlot | undefined;
  slotKey: string;
  className?: string;
  /** Show the newsletter promo when unbooked. Off where the page already asks for signups. */
  emptyPromo?: boolean;
}) {
  const ratio = RATIO[slotKey] ?? "aspect-[3/1]";
  const booking = slot?.booking ?? null;

  if (booking) {
    return (
      <aside aria-label="Advertisement" className={className}>
        <p className="mb-1.5 text-xs text-muted">Advertisement from {booking.sponsorName}</p>
        <a
          href={`/go/ad/${booking.id}`}
          rel="sponsored noopener"
          target="_blank"
          onClick={() => track("Ad Click", { slot: slotKey, sponsor: booking.sponsorName })}
          className="block overflow-hidden rounded-md border border-line"
        >
          <img
            src={booking.creativeUrl}
            alt={booking.altText}
            width={slot!.width}
            height={slot!.height}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </aside>
    );
  }

  // Rendered on the server with the page, so an empty slot causes no layout shift.
  if (!emptyPromo) return null;
  return (
    <aside aria-label="From CoinGist" className={className}>
      <Link
        to="/newsletter"
        className={`flex ${ratio} min-h-24 w-full flex-col items-start justify-center gap-1 rounded-md bg-gist px-6 text-gist-ink hover:opacity-95`}
      >
        <span className="font-display text-xl font-extrabold sm:text-2xl">The gist, every weekday morning</span>
        <span className="text-sm font-semibold underline underline-offset-4">Get the Daily Gist newsletter</span>
      </Link>
    </aside>
  );
}
