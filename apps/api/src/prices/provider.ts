import type { PriceQuote, PriceTicker } from "@coingist/types";

export interface PriceProvider {
  readonly source: string;
  readonly sample: boolean;
  fetchQuotes(): Promise<PriceQuote[]>;
}

/** Coins in the ticker, in display order (CoinGecko ids). */
export const TICKER_COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
] as const;

/** CoinGecko's simple price endpoint (public, or with a demo/pro API key). */
export function createCoinGeckoProvider(opts: { apiKey?: string | undefined; baseUrl?: string; fetch?: typeof fetch } = {}): PriceProvider {
  const base = (opts.baseUrl ?? "https://api.coingecko.com/api/v3").replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  return {
    source: "CoinGecko",
    sample: false,
    async fetchQuotes() {
      const ids = TICKER_COINS.map((c) => c.id).join(",");
      const res = await doFetch(`${base}/simple/price?ids=${ids}&vs_currencies=usd,ngn&include_24hr_change=true`, {
        headers: { accept: "application/json", ...(opts.apiKey ? { "x-cg-demo-api-key": opts.apiKey } : {}) },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const body = (await res.json()) as Record<string, { usd?: number; ngn?: number; usd_24h_change?: number }>;
      return TICKER_COINS.flatMap((c) => {
        const q = body[c.id];
        if (!q || typeof q.usd !== "number" || !Number.isFinite(q.usd)) return [];
        return [{
          ...c,
          usd: q.usd,
          ngn: typeof q.ngn === "number" && Number.isFinite(q.ngn) ? q.ngn : null,
          change24h: typeof q.usd_24h_change === "number" && Number.isFinite(q.usd_24h_change) ? q.usd_24h_change : null,
        }];
      });
    },
  };
}

/** Fixed, clearly labelled sample prices for local development, tests and previews. */
export function createSamplePriceProvider(): PriceProvider {
  const sample: Record<string, [number, number, number]> = {
    bitcoin: [64000, 102_000_000, 1.8], ethereum: [3100, 4_950_000, -0.9], tether: [1, 1595, 0.01],
    "usd-coin": [1, 1594, 0], solana: [145, 231_000, 3.2], binancecoin: [560, 893_000, -1.4],
  };
  return {
    source: "Sample data",
    sample: true,
    async fetchQuotes() {
      return TICKER_COINS.map((c) => {
        const [usd, ngn, change24h] = sample[c.id]!;
        return { ...c, usd, ngn, change24h };
      });
    },
  };
}

/**
 * Cache in front of a provider: fresh for `ttlMs`, then refreshed; if the source fails, the
 * last good prices are served for up to `staleMs` before giving up. One fetch at a time.
 */
export function cachedTicker(provider: PriceProvider, opts: { ttlMs?: number; staleMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 60_000;
  const stale = opts.staleMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  let last: { ticker: PriceTicker; at: number } | null = null;
  let inflight: Promise<PriceTicker | null> | null = null;

  const refresh = async (): Promise<PriceTicker | null> => {
    try {
      const quotes = await provider.fetchQuotes();
      if (!quotes.length) throw new Error("no quotes");
      last = { ticker: { quotes, source: provider.source, updatedAt: new Date(now()).toISOString(), sample: provider.sample }, at: now() };
      return last.ticker;
    } catch (err) {
      console.warn(`prices: ${(err as Error).message}`);
      return last && now() - last.at < stale ? last.ticker : null;
    } finally {
      inflight = null;
    }
  };

  return async (): Promise<PriceTicker | null> => {
    if (last && now() - last.at < ttl) return last.ticker;
    inflight ??= refresh();
    return inflight;
  };
}
