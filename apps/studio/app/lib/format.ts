const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
export const formatWhen = (iso: string) => `${fmt.format(new Date(iso))} UTC`;

/** "₦150.50", "$1,200.00"; falls back to "150.50 XYZ" for codes Intl doesn't know. */
export function formatMoney(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "Mon 16 Nov" for a YYYY-MM-DD date. */
export const formatDay = (ymd: string) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));
/** "16 Nov" for a YYYY-MM-DD date or ISO timestamp. */
export const formatShortDate = (d: string) => shortFmt.format(new Date(d.length === 10 ? `${d}T00:00:00Z` : d));

/** "3 days", "5 hours", "just now": how long ago `iso` was, relative to `now`. */
export function age(iso: string, now: string): string {
  const mins = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60_000));
  if (mins < 60) return mins < 2 ? "a moment" : `${mins} minutes`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/** "₦300.00 + $120.00", or "None" — amounts in different currencies are never added together. */
export function sumByCurrency(rows: Array<{ currency: string; amount: string }>): string {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.amount));
  return by.size ? [...by].map(([c, n]) => formatMoney(n.toFixed(2), c)).join(" + ") : "None";
}

/** "just now", "5 hours ago". */
export const ago = (iso: string, now: string) => {
  const a = age(iso, now);
  return a === "a moment" ? "just now" : `${a} ago`;
};

/** "1 writer", "3 editors". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
