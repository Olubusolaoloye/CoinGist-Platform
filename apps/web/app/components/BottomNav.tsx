import { NavLink } from "react-router";

const ITEMS = [
  { to: "/", label: "Home", end: true, d: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { to: "/news", label: "News", end: false, d: "M4 5h13v14H5a1 1 0 0 1-1-1zM17 9h3v9a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 16h4" },
  { to: "/gist", label: "Gist", end: false, d: "M5 6h14v9H9l-4 4z" },
  { to: "/learn", label: "Learn", end: false, d: "M12 6c-2-1.5-5-2-8-1.5V18c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v13.5" },
  { to: "/africa", label: "Africa", end: false, d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" },
];

/** Thumb-reach navigation for phones. */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-medium ${isActive ? "text-link" : "text-muted"}`
              }
            >
              {({ isActive }) => (
                <>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                    <path d={item.d} />
                  </svg>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
