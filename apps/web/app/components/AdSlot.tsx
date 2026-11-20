import { Link } from "react-router";
import type { PublicAdSlot } from "@coingist/types";
import { Picture } from "~/components/Picture";
import { track } from "~/lib/analytics";

/**
 * Fixed-ratio boxes per slot. Static class names (Tailwind only generates classes it can see),
 * and no inline styles, which the CSP blocks.
 */
const RATIO: Record<string, string> = {
  "home-banner": "aspect-[24/5]",
  "article-end": "aspect-[3/1]",
};

/** How wide each slot is ever shown (CSS px), and on which screens, so the CDN sends the right size. */
const SIZE: Record<string, { maxWidth: number; sizes: string }> = {
  "home-banner": { maxWidth: 1200, sizes: "(min-width: 1280px) 1200px, calc(100vw - 2rem)" },
  "article-end": { maxWidth: 736, sizes: "(min-width: 800px) 736px, calc(100vw - 2rem)" },
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
  const size = SIZE[slotKey] ?? { maxWidth: 1200, sizes: "100vw" };
  const booking = slot?.booking ?? null;

  if (booking) {
    return (
      <aside aria-label="Advertisement" className={className}>
        <p className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-line px-2 py-0.5 font-semibold tracking-wide uppercase">Ad</span>
          <span>Advertisement from {booking.sponsorName}</span>
        </p>
        <a
          href={`/go/ad/${booking.id}`}
          rel="sponsored noopener"
          target="_blank"
          onClick={() => track("Ad Click", { slot: slotKey, sponsor: booking.sponsorName })}
          className={`glass block ${ratio} overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none`}
        >
          {/* The box keeps the slot's shape, so a creative of the wrong size can't move the page. */}
          <Picture
            url={booking.creativeUrl}
            maxWidth={size.maxWidth}
            sizes={size.sizes}
            alt={booking.altText}
            width={slot!.width}
            height={slot!.height}
            loading="lazy"
            decoding="async"
            className="block h-full w-full object-cover"
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
        className={`relative flex ${ratio} min-h-28 w-full flex-col items-start justify-center gap-1 overflow-hidden rounded-2xl bg-gist px-6 text-gist-ink hover:opacity-95 sm:px-10`}
      >
        <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -top-10 -right-8 hidden size-56 text-night sm:block">
          <circle cx="100" cy="100" r="80" fill="currentColor" />
          <circle cx="100" cy="100" r="52" fill="none" stroke="var(--gist)" strokeWidth="14" />
        </svg>
        <span className="relative text-xs font-semibold tracking-wide uppercase opacity-80">Free newsletter</span>
        <span className="relative font-display text-xl font-extrabold sm:text-3xl">The gist, every weekday morning</span>
        <span className="relative text-sm font-semibold underline underline-offset-4">Get the Daily Gist newsletter</span>
      </Link>
    </aside>
  );
}
