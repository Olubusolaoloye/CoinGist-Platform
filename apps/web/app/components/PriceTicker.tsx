import { useState } from "react";
import type { PriceTicker as Ticker } from "@coingist/types";
import { PauseButton } from "./PauseButton";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 }).format(n);

function Quotes({ ticker, copy }: { ticker: Ticker; copy?: boolean }) {
  return (
    <ul className={`flex shrink-0 gap-8 pr-8 ${copy ? "marquee-copy" : ""}`} aria-hidden={copy || undefined}>
      {ticker.quotes.map((q) => {
        const up = (q.change24h ?? 0) >= 0;
        return (
          <li key={q.id} className="flex items-baseline gap-1.5 whitespace-nowrap">
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
  );
}

/**
 * Prices strip under the header: scrolls continuously (CSS only, so it moves before JavaScript
 * loads). Holds while hovered or focused, has a pause button, and stays still for people who
 * prefer reduced motion. Server-rendered from the API's cached prices.
 */
export function PriceTicker({ ticker }: { ticker: Ticker }) {
  const [paused, setPaused] = useState(false);
  return (
    <section aria-label="Crypto prices">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 text-sm">
        <div className="marquee min-w-0 flex-1" data-paused={paused || undefined} tabIndex={0} aria-label="Prices">
          <div className="marquee-track flex">
            <Quotes ticker={ticker} />
            <Quotes ticker={ticker} copy />
          </div>
        </div>
        {ticker.sample ? <p className="hidden shrink-0 text-xs text-muted md:block">Sample prices</p> : null}
        <PauseButton paused={paused} onClick={() => setPaused((p) => !p)} what="prices" className="marquee-control size-7" />
      </div>
    </section>
  );
}
