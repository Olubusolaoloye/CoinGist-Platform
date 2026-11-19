import type { PriceTicker } from "@coingist/types";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 }).format(n);
const ngn = (n: number) =>
  `₦${new Intl.NumberFormat("en-NG", { notation: n >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: n >= 1_000_000 ? 1 : 0 }).format(n)}`;

/** Prices beside the news, in dollars and naira. Direction always has an arrow and words. */
export function MarketsPanel({ ticker }: { ticker: PriceTicker | null }) {
  if (!ticker || ticker.quotes.length === 0) return null;
  return (
    <section aria-labelledby="markets-h" className="glass rounded-3xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="markets-h" className="font-display text-xl font-extrabold">Markets today</h2>
        <span className="text-xs text-muted">24h</span>
      </div>
      <ul className="mt-3 space-y-2">
        {ticker.quotes.map((q) => {
          const up = (q.change24h ?? 0) >= 0;
          return (
            <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-surface/70 px-3 py-2.5">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-night text-[0.7rem] font-bold text-gist">
                {q.symbol.slice(0, 4)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{q.name}</p>
                {q.ngn !== null ? <p className="text-xs text-muted tabular-nums">{ngn(q.ngn)}</p> : null}
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{usd(q.usd)}</p>
                {q.change24h !== null ? (
                  <p className={`text-xs font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
                    <span aria-hidden="true">{up ? "▲" : "▼"}</span>
                    <span className="sr-only">{up ? "up" : "down"}</span> {Math.abs(q.change24h).toFixed(1)}%
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">{ticker.sample ? "Sample prices" : `Prices from ${ticker.source}, may be delayed. Not financial advice.`}</p>
    </section>
  );
}
