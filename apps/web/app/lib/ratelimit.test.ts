import { describe, expect, it } from "vitest";
import { allow, clientIp } from "./ratelimit.server";

describe("signup rate limit", () => {
  it("allows up to the limit per key within the window, then resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allow("ip:a", 5, 60_000, t0)).toBe(true);
    expect(allow("ip:a", 5, 60_000, t0)).toBe(false);
    expect(allow("ip:b", 5, 60_000, t0)).toBe(true);
    expect(allow("ip:a", 5, 60_000, t0 + 60_001)).toBe(true);
  });

  it("prefers the CDN's client IP header", () => {
    const req = new Request("http://x", { headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
  });
});
