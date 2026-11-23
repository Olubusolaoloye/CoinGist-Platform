import { Link, useLocation } from "react-router";
import { inLearnEarn } from "~/lib/format";
import { useSignedIn } from "./ReaderButtons";

type Item = { to: string; label: string; d: string; active: (path: string) => boolean };

const HOME = "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z";
const NEWS = "M4 5h13v14H5a1 1 0 0 1-1-1zM17 9h3v9a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 16h4";
const GIST = "M5 6h14v9H9l-4 4z";
// A graduation cap with a coin: learn, then earn.
const EARN = "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v5";
const YOU = "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6";

const under = (p: string) => (path: string) => path === p || path.startsWith(`${p}/`);

/** App-style tab bar for phones: thumb reach, clear active state. */
export function BottomNav() {
  const { pathname } = useLocation();
  const signedIn = useSignedIn();
  const items: Item[] = [
    { to: "/", label: "Home", d: HOME, active: (p) => p === "/" },
    { to: "/news", label: "News", d: NEWS, active: under("/news") },
    { to: "/gist", label: "Gist", d: GIST, active: under("/gist") },
    { to: "/learn-earn", label: "Learn & Earn", d: EARN, active: inLearnEarn },
    {
      to: signedIn ? "/for-you" : "/account/login",
      label: signedIn ? "For you" : "Sign in",
      d: YOU,
      active: (p) => p === "/for-you" || p.startsWith("/account"),
    },
  ];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const isActive = item.active(pathname);
          return (
            <li key={item.label}>
              <Link
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium whitespace-nowrap ${isActive ? "text-link" : "text-muted"}`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? "bg-link/15" : ""}`}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                    <path d={item.d} />
                  </svg>
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
