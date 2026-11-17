import { Link } from "react-router";

const ICON: Record<string, string> = {
  news: "M4 5h13v14H5a1 1 0 0 1-1-1zM17 9h3v9a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 16h4",
  gist: "M5 6h14v9H9l-4 4z",
  learn: "M12 6c-2-1.5-5-2-8-1.5V18c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v13.5",
  africa: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z",
  markets: "M4 19h16M6 16l4-5 3 3 5-7M15 7h3v3",
  stablecoins: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.3 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.7 3-2M12 6v1.5M12 16.5V18",
  security: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4",
  ethereum: "M12 3l6 9-6 3.5L6 12zM6 13.5l6 7.5 6-7.5-6 3.5z",
  bitcoin: "M9 4v16M13 4v2M13 18v2M7 6h7a3 3 0 0 1 0 6H7M7 12h8a3 3 0 0 1 0 6H7",
  regulation: "M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6zM8 21h8",
};

export interface Tile {
  to: string;
  label: string;
  icon: string;
}

/** Big tappable shortcuts into sections and topics. */
export function CategoryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <nav aria-label="Browse by topic">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 py-4 text-center text-sm font-semibold shadow-sm hover:border-ink"
            >
              <svg viewBox="0 0 24 24" className="size-7 text-link" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON[t.icon] ?? ICON["news"]} />
              </svg>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
