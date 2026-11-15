import { useEffect, useState } from "react";
import { useFetcher, useLocation } from "react-router";

export type ThemePref = "light" | "dark" | "system";

function effectiveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Works without JavaScript (plain form POST + redirect). With JavaScript it switches instantly
 * and saves the choice in the background.
 */
export function ThemeToggle({ pref }: { pref: ThemePref }) {
  const fetcher = useFetcher();
  const location = useLocation();
  // Server can't see the OS setting; assume light until hydrated.
  const [current, setCurrent] = useState<"light" | "dark">(pref === "dark" ? "dark" : "light");
  useEffect(() => setCurrent(effectiveTheme(pref)), [pref]);

  const next = current === "dark" ? "light" : "dark";

  return (
    <form
      method="post"
      action="/resources/theme"
      onSubmit={(e) => {
        e.preventDefault();
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(next);
        setCurrent(next);
        void fetcher.submit({ theme: next }, { method: "post", action: "/resources/theme" });
      }}
    >
      <input type="hidden" name="theme" value={next} />
      <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
      <button
        type="submit"
        className="inline-flex size-11 items-center justify-center rounded-md hover:bg-line"
        aria-label={next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
      >
        {next === "dark" ? (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </button>
    </form>
  );
}
