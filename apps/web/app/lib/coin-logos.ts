/** Coin logos served from /coins (web3icons, MIT; see docs/image-credits.md). */
const LOGOS = new Set(["btc", "eth", "usdt", "usdc", "sol", "bnb"]);

/** The logo path for a ticker symbol, or null when we don't have one (a text badge is shown). */
export function coinLogo(symbol: string): string | null {
  const s = symbol.toLowerCase();
  return LOGOS.has(s) ? `/coins/${s}.svg` : null;
}
