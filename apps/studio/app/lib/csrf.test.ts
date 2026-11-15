import { describe, expect, it } from "vitest";
import { assertSameOrigin, hostMatches } from "./csrf.server";

const post = (headers: Record<string, string>) => new Request("http://localhost:5174/posts/new", { method: "POST", headers });
const blocked = (r: Request) => {
  try {
    assertSameOrigin(r);
    return false;
  } catch {
    return true;
  }
};

describe("assertSameOrigin", () => {
  it("allows Studio's own origin, including behind a proxy", () => {
    expect(blocked(post({ origin: "http://localhost:5174", host: "localhost:5174" }))).toBe(false);
    expect(blocked(post({ origin: "https://studio.preview.test", host: "studio.preview.test" }))).toBe(false);
    expect(blocked(post({ origin: "https://studio.preview.test", host: "localhost:5174", "x-forwarded-host": "studio.preview.test" }))).toBe(false);
  });

  it("blocks other sites and missing origins", () => {
    expect(blocked(post({ origin: "https://evil.example", host: "localhost:5174" }))).toBe(true);
    expect(blocked(post({ host: "localhost:5174" }))).toBe(true);
    expect(blocked(post({ origin: "null", host: "localhost:5174" }))).toBe(true);
  });

  it("never checks safe methods", () => {
    expect(blocked(new Request("http://localhost:5174/posts", { headers: { origin: "https://evil.example" } }))).toBe(false);
  });
});

describe("hostMatches", () => {
  it("supports * and ** patterns", () => {
    expect(hostMatches("a.example.com", "*.example.com")).toBe(true);
    expect(hostMatches("a.b.example.com", "*.example.com")).toBe(false);
    expect(hostMatches("a.b.example.com", "**.example.com")).toBe(true);
    expect(hostMatches("example.com.evil", "example.com")).toBe(false);
    expect(hostMatches("anything.test", "**")).toBe(true);
  });
});
