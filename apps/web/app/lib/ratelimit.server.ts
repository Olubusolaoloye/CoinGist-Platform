/** Per-visitor limit for form posts (in-memory; Cloudflare rules do the heavy lifting in production). */
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  let e = hits.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + windowMs };
    hits.set(key, e);
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  e.count += 1;
  return e.count <= max;
}
