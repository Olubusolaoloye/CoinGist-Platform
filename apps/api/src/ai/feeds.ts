import type { TrendingHeadline } from "@coingist/types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();

/** Titles and links from an RSS or Atom document (no external XML parser needed). */
export function parseFeed(xml: string, source: string, max = 15): TrendingHeadline[] {
  const out: TrendingHeadline[] = [];
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const item of items.slice(0, max)) {
    const title = decode(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link =
      decode(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "") ||
      (item.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] ?? "");
    if (title && /^https?:\/\//i.test(link)) out.push({ title: title.slice(0, 300), link, source });
  }
  return out;
}

/**
 * Fetch headlines from the configured feeds. Each feed has a short timeout and a size cap;
 * a feed that fails is skipped (and reported), never fatal.
 */
export async function fetchHeadlines(
  urls: string[],
  opts: { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ headlines: TrendingHeadline[]; failed: string[] }> {
  const doFetch = opts.fetch ?? fetch;
  const failed: string[] = [];
  const results = await Promise.all(
    urls.map(async (url) => {
      const source = new URL(url).hostname.replace(/^www\./, "");
      try {
        const res = await doFetch(url, {
          headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (body.length > (opts.maxBytes ?? 1_000_000)) throw new Error("feed too large");
        return parseFeed(body, source);
      } catch (err) {
        console.warn(`trending: couldn't read ${source}: ${(err as Error).message}`);
        failed.push(source);
        return [];
      }
    }),
  );
  // Drop duplicate stories that several feeds carry.
  const seen = new Set<string>();
  const headlines = results.flat().filter((h) => {
    const key = h.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { headlines: headlines.slice(0, 60), failed };
}
