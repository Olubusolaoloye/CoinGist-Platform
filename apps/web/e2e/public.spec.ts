import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ARTICLE = "/news/stablecoin-transfers-climb-remittances";
const SPONSORED = "/sponsored/examplepay-cross-border-payments";

async function jsonLd(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b) as Record<string, unknown>);
}

test.describe("home", () => {
  test("renders the lead story server-side and links to it", async ({ page, request }) => {
    // The HTML from the server already contains the content (SEO).
    const html = await (await request.get("/")).text();
    expect(html).toContain("Stablecoin transfers climb");
    expect(html).toContain("The gist in 30 seconds");

    await page.goto("/");
    await page.getByRole("link", { name: /Stablecoin transfers climb/ }).first().click();
    await expect(page).toHaveURL(ARTICLE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Stablecoin transfers climb/);
  });

  test("never shows unpublished drafts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("should never appear")).toHaveCount(0);
  });
});

test.describe("article", () => {
  test("has complete SEO metadata", async ({ page }) => {
    await page.goto(`${ARTICLE}?utm_source=x`);
    await expect(page).toHaveTitle(/^Stablecoin transfers climb.*\| CoinGist$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://coingist.test${ARTICLE}`);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\/coingist\.test\/sample\//);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    const ld = await jsonLd(page);
    const article = ld.find((d) => d["@type"] === "NewsArticle");
    expect(article).toMatchObject({
      headline: expect.stringContaining("Stablecoin transfers climb"),
      datePublished: expect.any(String),
      dateModified: expect.any(String),
      author: [{ "@type": "Person", name: "Kwame Mensah", url: "https://coingist.test/author/kwame-mensah" }],
      publisher: { name: "CoinGist", logo: { url: "https://coingist.test/logo-512.png" } },
      image: [expect.stringMatching(/^https:\/\//)],
    });
    expect(ld.some((d) => d["@type"] === "BreadcrumbList")).toBe(true);
  });

  test("shows the gist, byline, disclaimer and share options", async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.getByRole("complementary", { name: "The gist in 30 seconds" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kwame Mensah" }).first()).toBeVisible();
    await expect(page.getByText("Not financial advice.").first()).toBeVisible();
    for (const name of ["X", "WhatsApp", "Telegram"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  test("copies the link", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(ARTICLE);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("status")).toHaveText("Link copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://coingist.test${ARTICLE}`);
  });

  test("marks external body links nofollow and keeps internal links plain", async ({ page }) => {
    await page.goto(ARTICLE);
    const body = page.locator(".article-body");
    await expect(body.getByRole("link", { name: "example reference" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    await expect(body.getByRole("link", { name: "editorial policy" })).not.toHaveAttribute("rel", /.+/);
  });

  test("labels sponsored content and uses rel=sponsored", async ({ page }) => {
    await page.goto(SPONSORED);
    await expect(page.getByText(/^Sponsored/).first()).toBeVisible();
    await expect(page.getByText(/This is a paid placement/)).toBeVisible();
    await expect(page.locator(".article-body").getByRole("link", { name: "example reference" })).toHaveAttribute(
      "rel",
      "noopener noreferrer sponsored",
    );
  });

  test("redirects a story requested under the wrong section", async ({ request }) => {
    const res = await request.get("/gist/stablecoin-transfers-climb-remittances", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toBe(ARTICLE);
  });

  test("returns a noindex 404 for drafts and unknown pages", async ({ page }) => {
    for (const path of ["/news/unpublished-draft-never-visible", "/nope/at/all", "/category/nope", "/news?page=50"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    }
  });
});

test.describe("listings and authors", () => {
  test("category, tag and author pages list the right stories", async ({ page }) => {
    await page.goto("/africa");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Africa");
    await expect(page.getByRole("link", { name: /P2P trading is still king/ })).toBeVisible();

    await page.goto("/tag/p2p");
    await expect(page.getByRole("article")).toHaveCount(1);

    await page.goto("/author/zanele-dube");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zanele Dube");
    const ld = await jsonLd(page);
    expect(ld.find((d) => d["@type"] === "ProfilePage")).toBeTruthy();
  });

  test("/category/africa redirects to /africa", async ({ request }) => {
    const res = await request.get("/category/africa", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toBe("/africa");
  });

  test("pages are cacheable at the CDN, errors are not", async ({ request }) => {
    expect((await request.get("/news")).headers()["cache-control"]).toContain("s-maxage=60");
    expect((await request.get("/news/unpublished-draft-never-visible")).headers()["cache-control"]).toBe("no-store");
  });
});

test.describe("navigation", () => {
  test("mobile: bottom nav and menu work", async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await page.goto("/");
    const bottom = page.getByRole("navigation", { name: "Primary" });
    await expect(bottom).toBeVisible();
    await bottom.getByRole("link", { name: "Learn" }).click();
    await expect(page).toHaveURL("/learn");
    await expect(bottom.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Menu").click();
    await page.getByRole("link", { name: "Security" }).last().click();
    await expect(page).toHaveURL("/category/security");
    await expect(page.locator("details")).not.toHaveAttribute("open", "");
  });

  test("desktop: section nav is visible, bottom nav is hidden", async ({ page, isMobile }) => {
    test.skip(isMobile);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Sections" }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  });

  test("skip link is the first focusable element", async ({ page, isMobile }) => {
    test.skip(isMobile);
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("headings never skip a level", async ({ page }) => {
    for (const path of ["/", ARTICLE, "/africa", "/news", "/tag/p2p", "/author/amara-okafor"]) {
      await page.goto(path);
      const levels = await page.$$eval("main h1, main h2, main h3, main h4", (els) =>
        els.map((e) => Number(e.tagName[1])),
      );
      expect(levels[0], path).toBe(1);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]! - levels[i - 1]!, `${path} heading ${i}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("no horizontal scrolling on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/", ARTICLE, "/africa", "/author/amara-okafor", SPONSORED]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("theme", () => {
  test("toggles and remembers dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("works without JavaScript", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto("/learn");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page).toHaveURL("/learn");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await ctx.close();
  });
});

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const path of ["/", ARTICLE, "/africa", "/author/amara-okafor", SPONSORED, "/does-not-exist"]) {
      test(`${scheme} ${path}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
      });
    }
  }
});
