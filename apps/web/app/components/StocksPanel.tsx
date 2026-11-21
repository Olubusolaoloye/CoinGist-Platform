import { useEffect, useRef, useState } from "react";

/** Crypto-related US stocks and the S&P 500 (TradingView symbols). */
const STOCKS = [
  { name: "NASDAQ:COIN", displayName: "Coinbase" },
  { name: "NASDAQ:MSTR", displayName: "Strategy" },
  { name: "NASDAQ:HOOD", displayName: "Robinhood" },
  { name: "NASDAQ:NVDA", displayName: "Nvidia" },
  { name: "NASDAQ:TSLA", displayName: "Tesla" },
  { name: "FOREXCOM:SPXUSD", displayName: "S&P 500" },
];

const HEIGHT = 300;

function isDark(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Notable stocks, from TradingView's free Market Quotes widget (delayed prices, with
 * TradingView's attribution, as its terms require). The widget's script only loads once the
 * page has finished loading and the panel is near the screen, and its space is reserved, so it
 * never slows the page down or makes it jump. It follows the site's light/dark theme.
 */
export function StocksPanel() {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [dark, setDark] = useState<boolean | null>(null);

  // Load only when the panel is close to view, after the page itself has loaded.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io?.disconnect();
        }
      }, { rootMargin: "300px" });
      io.observe(el);
    };
    if (document.readyState === "complete") watch();
    else window.addEventListener("load", watch, { once: true });
    return () => {
      window.removeEventListener("load", watch);
      io?.disconnect();
    };
  }, []);

  // Follow the theme (including the header's theme switch).
  useEffect(() => {
    setDark(isDark());
    const mo = new MutationObserver(() => setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(isDark());
    mq.addEventListener("change", on);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", on);
    };
  }, []);

  useEffect(() => {
    const host = box.current?.querySelector<HTMLDivElement>("[data-widget]");
    if (!near || dark === null || !host) return;
    host.replaceChildren();
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js";
    script.async = true;
    script.text = JSON.stringify({
      width: "100%",
      height: HEIGHT,
      symbolsGroups: [{ name: "Stocks", symbols: STOCKS }],
      showSymbolLogo: true,
      isTransparent: true,
      colorTheme: dark ? "dark" : "light",
      locale: "en",
    });
    host.append(widget, script);
  }, [near, dark]);

  return (
    <section aria-labelledby="stocks-h" className="glass rounded-3xl p-5" ref={box}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="stocks-h" className="font-display text-xl font-extrabold">Stocks to watch</h2>
        <span className="text-xs text-muted">Delayed</span>
      </div>
      <div className="tradingview-widget-container stocks-frame mt-3 h-[300px] overflow-hidden rounded-2xl">
        <div data-widget className="h-full" />
      </div>
      <p className="mt-2 text-xs text-muted">
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank" className="text-link">
          Stock prices by TradingView<span className="sr-only"> (opens in a new tab)</span>
        </a>
        . Not financial advice.
      </p>
    </section>
  );
}
