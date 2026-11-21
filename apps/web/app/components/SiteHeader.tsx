import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { Category } from "@coingist/types";
import { useSignedIn } from "./ReaderButtons";
import { ThemeToggle, type ThemePref } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

const SECTIONS = [
  { to: "/news", label: "News" },
  { to: "/gist", label: "Gist" },
  { to: "/learn", label: "Learn" },
  { to: "/africa", label: "Africa" },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 font-semibold hover:bg-line/70 ${isActive ? "bg-night text-night-ink hover:bg-night" : ""}`;

export function SiteHeader({ categories, theme }: { categories: Category[]; theme: ThemePref }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.pathname]);

  const strip = categories.filter((c) => c.slug !== "africa");
  // Personal links are decided in the browser, so this cached header is the same for everyone.
  const signedIn = useSignedIn();

  return (
    <header className="sticky top-0 z-40 px-2 pt-2 sm:px-4 sm:pt-3">
      <div className="glass glass-strong mx-auto max-w-6xl rounded-2xl">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <Link to="/" className="mr-auto rounded-md py-1" aria-label="CoinGist home">
          <Wordmark />
        </Link>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {SECTIONS.map((s) => (
              <li key={s.to}>
                <NavLink to={s.to} className={navClass}>
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          to="/search"
          aria-label="Search"
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-line"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
        </Link>
        <ThemeToggle pref={theme} />
        <Link
          to={signedIn ? "/for-you" : "/account/login"}
          aria-label={signedIn ? "Your feed and account" : "Sign in"}
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-line"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill={signedIn ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        </Link>
        <Link
          to="/newsletter"
          className="hidden min-h-10 items-center rounded-full bg-gist px-4 text-sm font-bold text-gist-ink hover:opacity-90 sm:inline-flex"
        >
          Subscribe
        </Link>
        <details ref={menu} className="group relative md:hidden">
          <summary
            className="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-line [&::-webkit-details-marker]:hidden"
            aria-label="Menu"
          >
            <svg viewBox="0 0 24 24" className="size-6 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg viewBox="0 0 24 24" className="hidden size-6 group-open:block" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-4 shadow-lg">
            <p className="text-sm font-semibold text-muted">Sections</p>
            <ul className="mt-1 grid grid-cols-2 gap-1">
              {SECTIONS.map((s) => (
                <li key={s.to}>
                  <Link to={s.to} className="block rounded-md px-2 py-2 font-semibold hover:bg-line">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/newsletter" className="mt-2 block rounded-md bg-gist px-2 py-2 font-semibold text-gist-ink">
              Get the newsletter
            </Link>
            {signedIn ? (
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Link to="/for-you" className="block rounded-md px-2 py-2 font-semibold hover:bg-line">For you</Link>
                <Link to="/account" className="block rounded-md px-2 py-2 font-semibold hover:bg-line">Saved and following</Link>
              </div>
            ) : (
              <Link to="/account/login" className="mt-2 block rounded-md px-2 py-2 font-semibold hover:bg-line">Sign in to save stories</Link>
            )}
            <p className="mt-4 text-sm font-semibold text-muted">Topics</p>
            <ul className="mt-1 grid grid-cols-2 gap-1">
              {strip.map((c) => (
                <li key={c.slug}>
                  <Link to={`/category/${c.slug}`} className="block rounded-md px-2 py-2 hover:bg-line">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
      <nav aria-label="Topics" className="border-t border-line/60">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto px-2 py-1.5 text-sm whitespace-nowrap">
          {strip.map((c) => (
            <li key={c.slug}>
              <NavLink
                to={`/category/${c.slug}`}
                className={({ isActive }) =>
                  `inline-block rounded-full px-3 py-1.5 hover:bg-line ${isActive ? "bg-ink font-semibold text-paper hover:bg-ink" : ""}`
                }
              >
                {c.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      </div>
    </header>
  );
}
