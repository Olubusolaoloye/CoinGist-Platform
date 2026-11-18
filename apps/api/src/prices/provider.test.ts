import { describe, expect, it } from "vitest";
import { cachedTicker, createCoinGeckoProvider, createSamplePriceProvider, type PriceProvider } from "./provider.js";

describe("CoinGecko provider", () => {
  it("maps the response, skipping coins with bad data", async () => {
    const calls: string[] = [];
    const p = createCoinGeckoProvider({
      fetch: (async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({
          bitcoin: { usd: 64000.5, ngn: 1e8, usd_24h_change: 1.25 },
          ethereum: { usd: "oops" },
          tether: { usd: 1 },
        }));
      }) as typeof fetch,
    });
    const quotes = await p.fetchQuotes();
    expect(calls[0]).toContain("ids=bitcoin,ethereum,tether");
    expect(quotes).toEqual([
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin", usd: 64000.5, ngn: 1e8, change24h: 1.25 },
      { id: "tether", symbol: "USDT", name: "Tether", usd: 1, ngn: null, change24h: null },
    ]);
  });

  it("throws on HTTP errors", async () => {
    const p = createCoinGeckoProvider({ fetch: (async () => new Response("rate limited", { status: 429 })) as typeof fetch });
    await expect(p.fetchQuotes()).rejects.toThrow(/429/);
  });
});

describe("cachedTicker", () => {
  it("caches, refreshes after the TTL, and serves stale prices while the source is down", async () => {
    let t = 0;
    let fail = false;
    let calls = 0;
    const base = createSamplePriceProvider();
    const flaky: PriceProvider = { ...base, async fetchQuotes() { calls++; if (fail) throw new Error("down"); return base.fetchQuotes(); } };
    const get = cachedTicker(flaky, { ttlMs: 100, staleMs: 1000, now: () => t });

    expect((await get())!.sample).toBe(true);
    await get();
    expect(calls).toBe(1);

    t = 150; fail = true;
    expect(await get()).not.toBeNull(); // stale but within the window
    expect(calls).toBe(2);
    t = 2000;
    expect(await get()).toBeNull(); // too old to show
  });

  it("shares one in-flight fetch between concurrent callers", async () => {
    let calls = 0;
    const base = createSamplePriceProvider();
    const get = cachedTicker({ ...base, async fetchQuotes() { calls++; return base.fetchQuotes(); } });
    await Promise.all([get(), get(), get()]);
    expect(calls).toBe(1);
  });
});
