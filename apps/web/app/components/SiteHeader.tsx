import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { Category } from "@coingist/types";
import { ThemeToggle, type ThemePref } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

const SECTIONS = [
  { to: "/news", label: "News" },
  { to: "/gist", label: "Gist" },
  { to: "/learn", label: "Learn" },
  { to: "/africa", label: "Africa" },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 font-semibold hover:bg-line ${isActive ? "text-link underline decoration-2 underline-offset-8" : ""}`;

export function SiteHeader({ categories, theme }: { categories: Category[]; theme: ThemePref }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.pathname]);

  const strip = categories.filter((c) => c.slug !== "africa");

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
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
      <nav aria-label="Topics" className="border-t border-line">
        <ul className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-1.5 text-sm whitespace-nowrap">
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
    </header>
  );
}
