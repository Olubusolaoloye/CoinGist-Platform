import { Link } from "react-router";
import type { Category } from "@coingist/types";

const col = "font-display text-base font-bold text-night-ink";
const item = "text-night-muted hover:text-night-ink";

/** Always-dark footer with link columns and the site-wide disclaimer. */
export function SiteFooter({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-16 bg-night text-night-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <span className="font-display text-[1.6rem] leading-none font-extrabold tracking-tight">
            Coin<span className="ml-0.5 rounded-sm bg-gist px-1 text-gist-ink">Gist</span>
          </span>
          <p className="mt-3 max-w-[40ch] text-sm text-night-muted">Crypto and Web3 news, explained for readers across Africa and beyond.</p>
          <p className="mt-4 max-w-[46ch] text-sm text-night-muted">
            <strong className="text-night-ink">Not financial advice.</strong> Everything on CoinGist is for information and
            education. Crypto assets are volatile and you can lose money. Sponsored content is always labelled.
          </p>
        </div>
        <nav aria-label="Sections">
          <h2 className={col}>Read</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/news" className={item}>News</Link></li>
            <li><Link to="/gist" className={item}>Gist</Link></li>
            <li><Link to="/learn" className={item}>Learn</Link></li>
            <li><Link to="/africa" className={item}>Africa</Link></li>
            <li><Link to="/events" className={item}>Events</Link></li>
            <li><Link to="/opportunities" className={item}>Airdrops &amp; opportunities</Link></li>
            <li><Link to="/search" className={item}>Search</Link></li>
          </ul>
        </nav>
        <nav aria-label="Topics in footer">
          <h2 className={col}>Topics</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {categories.filter((c) => c.slug !== "africa").map((c) => (
              <li key={c.slug}><Link to={`/category/${c.slug}`} className={item}>{c.name}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="About CoinGist">
          <h2 className={col}>CoinGist</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/about" className={item}>About</Link></li>
            <li><Link to="/editorial-policy" className={item}>Editorial policy</Link></li>
            <li><Link to="/advertise" className={item}>Advertise</Link></li>
            <li><Link to="/privacy" className={item}>Privacy</Link></li>
            <li><Link to="/terms" className={item}>Terms</Link></li>
            <li><Link to="/newsletter" className={item}>Newsletters</Link></li>
            <li><a href="/rss.xml" className={item}>RSS feed</a></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 pt-5 pb-24 text-xs text-night-muted md:pb-6">© {new Date().getUTCFullYear()} CoinGist</p>
      </div>
    </footer>
  );
}
