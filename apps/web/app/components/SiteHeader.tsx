import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { Category } from "@coingist/types";
import { useSignedIn } from "./ReaderButtons";
import { ThemeToggle, type ThemePref } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";
import { inLearnEarn, LEARN_EARN_LINKS } from "~/lib/format";

const SECTIONS = [
  { to: "/news", label: "News" },
  { to: "/gist", label: "Gist" },
  { to: "/live", label: "Live" },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 font-semibold hover:bg-line/70 ${isActive ? "bg-night text-night-ink hover:bg-night" : ""}`;

export function SiteHeader({ categories, theme }: { categories: Category[]; theme: ThemePref }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.pathname]);

  const strip = categories;
  const earnActive = inLearnEarn(location.pathname);
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
                <NavLink to={s.to} className={(a) => `${navClass(a)} inline-flex items-center gap-1.5`}>
                  {s.to === "/live" ? <span aria-hidden="true" className="size-2 rounded-full bg-bad" /> : null}
                  {s.label}
                </NavLink>
              </li>
            ))}
            {/* Opens on hover or keyboard focus; the link itself goes to the Learn & Earn hub. */}
            <li className="group relative">
              <Link
                to="/learn-earn"
                aria-current={location.pathname === "/learn-earn" ? "page" : undefined}
                className={`${navClass({ isActive: earnActive })} inline-flex items-center gap-1`}
              >
                Learn &amp; Earn
                <svg viewBox="0 0 24 24" className="size-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </Link>
              <div className="invisible absolute top-full right-0 z-40 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul aria-label="Learn and Earn" className="w-80 rounded-2xl border border-line bg-surface p-2 shadow-xl">
                  {LEARN_EARN_LINKS.map((l) => (
                    <li key={l.to}>
                      <NavLink to={l.to} className={({ isActive }) => `block rounded-xl px-3 py-2.5 hover:bg-line/70 ${isActive ? "bg-line/70" : ""}`}>
                        <span className="block font-semibold">{l.label}</span>
                        <span className="block text-sm text-muted">{l.blurb}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
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
            <p className="mt-4 text-sm font-semibold text-muted">
              <Link to="/learn-earn">Learn &amp; Earn</Link>
            </p>
            <ul className="mt-1 grid gap-1">
              {LEARN_EARN_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="block rounded-md px-2 py-2 font-semibold hover:bg-line">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/newsletter" className="mt-3 block rounded-md bg-gist px-2 py-2 font-semibold text-gist-ink">
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
