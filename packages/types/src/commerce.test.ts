import { describe, expect, it } from "vitest";
import { AdBookingInputSchema, BlockedDomainInputSchema, normaliseDomain, OrderCreateSchema, vettingComplete, VETTING_ITEMS } from "./commerce.js";

describe("commerce inputs", () => {
  it("normalises blocked domains", () => {
    expect(normaliseDomain("https://www.Scam-Exchange.example/login?x=1")).toBe("scam-exchange.example");
    expect(BlockedDomainInputSchema.parse({ domain: "HTTP://Bad.example", reason: "Phishing" }).domain).toBe("bad.example");
    expect(BlockedDomainInputSchema.safeParse({ domain: "not a domain", reason: "x" }).success).toBe(false);
    expect(BlockedDomainInputSchema.safeParse({ domain: "bad.example", reason: "" }).success).toBe(false);
  });

  it("requires every vetting item", () => {
    const all = Object.fromEntries(VETTING_ITEMS.map((i) => [i.key, true]));
    expect(vettingComplete(all)).toBe(true);
    expect(vettingComplete({ ...all, no_guaranteed_returns: false })).toBe(false);
    expect(vettingComplete({})).toBe(false);
  });

  it("validates orders and bookings", () => {
    expect(OrderCreateSchema.parse({ sponsorId: "00000000-0000-4000-8000-000000000000", title: "Launch", amount: "1500.5", currency: "ngn" })).toMatchObject({ amount: "1500.5", currency: "NGN" });
    expect(OrderCreateSchema.safeParse({ sponsorId: "00000000-0000-4000-8000-000000000000", title: "x", amount: "1,500" }).success).toBe(false);
    const booking = { slotKey: "home-banner", sponsorId: "00000000-0000-4000-8000-000000000000", startsAt: "2026-11-20T00:00:00Z", endsAt: "2026-11-19T00:00:00Z", creativeUrl: "https://cdn.test/a.png", clickUrl: "https://sponsor.test", altText: "Ad" };
    expect(AdBookingInputSchema.safeParse(booking).success).toBe(false);
    expect(AdBookingInputSchema.safeParse({ ...booking, endsAt: "2026-12-01T00:00:00Z" }).success).toBe(true);
    expect(AdBookingInputSchema.safeParse({ ...booking, endsAt: "2026-12-01T00:00:00Z", clickUrl: "http://sponsor.test" }).success).toBe(false);
  });
});
