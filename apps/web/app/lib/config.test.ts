import { afterEach, describe, expect, it, vi } from "vitest";
import { searchIndexing } from "./config.server";

describe("searchIndexing", () => {
  afterEach(() => vi.unstubAllEnvs());
  const set = (env: Record<string, string>) => {
    for (const k of ["SITE_URL", "DEMO_MODE", "SITE_INDEXING"]) vi.stubEnv(k, env[k] ?? "");
  };

  it("keeps the temporary netlify.app address out of search engines", () => {
    set({ SITE_URL: "https://coingist-preview.netlify.app" });
    expect(searchIndexing()).toBe(false);
  });

  it("turns on by itself for the real domain", () => {
    set({ SITE_URL: "https://coingist.com" });
    expect(searchIndexing()).toBe(true);
  });

  it("is always off for demo deploys, and can be overridden", () => {
    set({ SITE_URL: "https://coingist.com", DEMO_MODE: "true" });
    expect(searchIndexing()).toBe(false);
    set({ SITE_URL: "https://coingist.com", SITE_INDEXING: "off" });
    expect(searchIndexing()).toBe(false);
    set({ SITE_URL: "https://coingist-preview.netlify.app", SITE_INDEXING: "on" });
    expect(searchIndexing()).toBe(true);
  });
});
