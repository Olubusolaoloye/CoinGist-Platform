import { afterEach, describe, expect, it, vi } from "vitest";
import { adsenseConfig, searchIndexing } from "./config.server";

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

describe("adsenseConfig", () => {
  afterEach(() => vi.unstubAllEnvs());
  const set = (env: Record<string, string>) => {
    for (const k of ["ADSENSE_CLIENT", "ADSENSE_SLOT_HOME_BANNER", "ADSENSE_SLOT_ARTICLE_END"]) vi.stubEnv(k, env[k] ?? "");
  };

  it("is off until a publisher ID is set", () => {
    set({});
    expect(adsenseConfig()).toBeNull();
  });

  it("switches off for a malformed publisher ID instead of breaking pages", () => {
    set({ ADSENSE_CLIENT: "pub-123\"><script>" });
    expect(adsenseConfig()).toBeNull();
  });

  it("only enables slots that have a valid ad unit ID", () => {
    set({ ADSENSE_CLIENT: " ca-pub-1234567890123456 ", ADSENSE_SLOT_HOME_BANNER: "1234567890", ADSENSE_SLOT_ARTICLE_END: "abc" });
    expect(adsenseConfig()).toEqual({ client: "ca-pub-1234567890123456", slots: { "home-banner": "1234567890" } });
  });
});
