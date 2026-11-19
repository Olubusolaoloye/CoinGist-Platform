import type { PriceTicker as Ticker } from "@coingist/types";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 }).format(n);

/**
 * Prices strip under the header. Server-rendered from the API's cached prices (no browser calls
 * to the price source); direction is shown with an arrow and words, not colour alone.
 */
export function PriceTicker({ ticker }: { ticker: Ticker }) {
  return (
    <section aria-label="Crypto prices">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-1.5 text-sm">
        <ul className="no-scrollbar relative flex min-w-0 flex-1 gap-5 overflow-x-auto whitespace-nowrap" tabIndex={0} aria-label="Prices, scroll for more">
          {ticker.quotes.map((q) => {
            const up = (q.change24h ?? 0) >= 0;
            return (
              <li key={q.id} className="flex items-baseline gap-1.5">
                <abbr title={q.name} className="font-bold no-underline">{q.symbol}</abbr>
                <span className="tabular-nums">{usd(q.usd)}</span>
                {q.change24h !== null ? (
                  <span className={`tabular-nums font-semibold ${up ? "text-up" : "text-down"}`}>
                    <span aria-hidden="true">{up ? "▲" : "▼"}</span>
                    <span className="sr-only">{up ? "up" : "down"}</span> {Math.abs(q.change24h).toFixed(1)}%
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="hidden shrink-0 text-xs text-muted md:block">
          {ticker.sample ? "Sample prices" : `${ticker.source}, 24h change, may be delayed`}
        </p>
      </div>
    </section>
  );
}
