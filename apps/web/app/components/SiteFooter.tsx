import { Link, useLocation } from "react-router";
import type { Category } from "@coingist/types";
import { NewsletterSignup } from "./NewsletterSignup";
import { Wordmark } from "./Wordmark";

export function SiteFooter({ categories }: { categories: Category[] }) {
  // The newsletter page has its own full form; don't repeat it.
  const onNewsletterPage = useLocation().pathname === "/newsletter";
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      {onNewsletterPage ? null : (
        <div className="mx-auto max-w-6xl border-b border-line px-4 py-10">
          <NewsletterSignup source="footer" />
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-[46ch] text-sm text-muted">
            Crypto and Web3 news, explained for readers across Africa and beyond.
          </p>
          <p className="mt-4 max-w-[52ch] text-sm text-muted">
            <strong className="text-ink">Not financial advice.</strong> Everything on CoinGist is for
            information and education only. Crypto assets are volatile and you can lose money. Sponsored
            content is always labelled.
          </p>
        </div>
        <nav aria-label="Sections">
          <h2 className="font-display font-bold">Read</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li><Link to="/news" className="hover:underline">News</Link></li>
            <li><Link to="/gist" className="hover:underline">Gist</Link></li>
            <li><Link to="/learn" className="hover:underline">Learn</Link></li>
            <li><Link to="/africa" className="hover:underline">Africa</Link></li>
            <li><Link to="/newsletter" className="hover:underline">Newsletters</Link></li>
          </ul>
        </nav>
        <nav aria-label="Topics in footer">
          <h2 className="font-display font-bold">Topics</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {categories
              .filter((c) => c.slug !== "africa")
              .map((c) => (
                <li key={c.slug}>
                  <Link to={`/category/${c.slug}`} className="hover:underline">{c.name}</Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-24 text-xs text-muted md:pb-8">
        © {new Date().getUTCFullYear()} CoinGist
      </p>
    </footer>
  );
}
