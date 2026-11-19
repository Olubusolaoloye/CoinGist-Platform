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
    expect(html).toContain("gist in 30 seconds");

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
    await expect(page.getByRole("status").filter({ hasText: "Link copied." })).toBeVisible();
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
    for (const path of ["/", ARTICLE, "/africa", "/news", "/tag/p2p", "/author/amara-okafor", "/search?q=stablecoin"]) {
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
    for (const path of ["/", ARTICLE, "/africa", "/author/amara-okafor", SPONSORED, "/search?q=bitcoin"]) {
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

test.describe("home and search", () => {
  test("spotlight changes story on request, beside today's gist and editors' picks", async ({ page, isMobile }) => {
    await page.goto("/");
    const spot = page.getByRole("region", { name: "Spotlight" });
    const slides = spot.locator('[aria-roledescription="slide"]');
    expect(await slides.count()).toBeGreaterThan(1);
    await expect(slides.first()).toHaveAttribute("data-active", "true");
    await spot.getByRole("button", { name: /^Story 2 of/ }).click();
    await expect(slides.nth(1)).toHaveAttribute("data-active", "true");
    await expect(slides.first()).toHaveAttribute("data-active", "false");
    const gist = page.getByRole("region", { name: "Today's gist in 30 seconds" });
    await expect(gist.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Markets today" })).toBeVisible();
    if (!isMobile) await expect(page.getByRole("region", { name: "Editors' picks" }).getByRole("listitem")).toHaveCount(5);
  });

  test("search finds stories by body text and handles odd input", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Search", exact: true }).first().click();
    await page.getByRole("searchbox").fill("remittances");
    await page.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/\/search\?q=remittances/);
    await expect(page.getByRole("link", { name: /Stablecoin transfers climb/ })).toBeVisible();
    const res = await request.get("/search?q=%22%29%28%3A%2A%26");
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("newsletter", () => {
  test("signs up for both newsletters on the newsletter page", async ({ page }) => {
    await page.goto("/newsletter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Get the gist in your inbox");
    await page.getByRole("checkbox", { name: /The Weekly Wrap/ }).check();
    await page.getByLabel("Email address").fill(`page-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status").filter({ hasText: /./ })).toHaveText("Check your inbox to confirm your subscription.");
    await expect(page.getByLabel("Email address")).toHaveCount(1);
  });

  test("section banner subscribes in place and clears the field", async ({ page }) => {
    await page.goto("/learn");
    const footer = page.getByRole("region", { name: "Stay in the loop" });
    await footer.getByLabel("Email address").fill(`footer-${Date.now()}@example.com`);
    await footer.getByRole("button", { name: "Subscribe" }).click();
    await expect(footer.getByRole("status")).toHaveText("Check your inbox to confirm your subscription.");
    await expect(footer.getByLabel("Email address")).toHaveValue("");
    await expect(page).toHaveURL("/learn");
  });

  test("article form shows validation errors", async ({ page }) => {
    await page.goto(ARTICLE);
    const box = page.getByRole("region", { name: /Liked this/ });
    await box.getByLabel("Email address").fill("nope@x");
    await box.getByRole("button", { name: "Subscribe" }).click();
    await expect(box.getByRole("status")).toHaveText("Enter a valid email address.");
  });

  test("works without JavaScript", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/gist");
    const footer = page.getByRole("region", { name: "Stay in the loop" });
    await footer.getByLabel("Email address").fill(`nojs-${Date.now()}@example.com`);
    await footer.getByRole("button", { name: "Subscribe" }).click();
    await expect(page).toHaveURL("/newsletter");
    await expect(page.getByText("Check your inbox to confirm your subscription.")).toBeVisible();
    await ctx.close();
  });

  test("form responses are never cached", async ({ request }) => {
    const res = await request.post("/newsletter", { form: { email: `cache-${Date.now()}@example.com`, lists: "daily-gist", source: "footer" } });
    expect(res.headers()["cache-control"]).toBe("no-store");
  });
});

test.describe("feeds, sitemaps and crawlers", () => {
  /** Parse XML in the browser so malformed feeds fail the test. */
  async function parseXml(page: Page, xml: string) {
    return page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      return doc.getElementsByTagName("parsererror").length === 0;
    }, xml);
  }

  test("robots.txt allows crawling and points at the sitemaps", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap: https://coingist.test/sitemap.xml");
    expect(body).toContain("Sitemap: https://coingist.test/news-sitemap.xml");
  });

  test("sitemap index and sitemaps are well-formed and list live content only", async ({ page, request }) => {
    for (const path of ["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-posts.xml", "/news-sitemap.xml"]) {
      const res = await request.get(path);
      expect(res.headers()["content-type"], path).toContain("application/xml");
      expect(await parseXml(page, await res.text()), path).toBe(true);
    }
    const index = await (await request.get("/sitemap.xml")).text();
    expect(index.match(/<sitemap>/g)).toHaveLength(3);

    const posts = await (await request.get("/sitemap-posts.xml")).text();
    expect(posts).toContain("<loc>https://coingist.test/news/stablecoin-transfers-climb-remittances</loc>");
    expect(posts).not.toContain("unpublished-draft-never-visible");

    const pages = await (await request.get("/sitemap-pages.xml")).text();
    for (const loc of ["/africa", "/author/amara-okafor", "/editorial-policy", "/tag/remittances"]) {
      expect(pages).toContain(`<loc>https://coingist.test${loc}</loc>`);
    }
    expect(pages).not.toContain("/tag/p2p"); // thin tag pages are noindex, so not listed
  });

  test("Google News sitemap has recent editorial stories, not sponsored ones", async ({ request }) => {
    const news = await (await request.get("/news-sitemap.xml")).text();
    expect(news).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(news).toContain("<news:name>CoinGist</news:name>");
    expect(news).toContain("/news/stablecoin-transfers-climb-remittances");
    expect(news).not.toContain("examplepay"); // sponsored
    expect(news).not.toContain("south-africa-exchanges-record-signups"); // 90 hours old
  });

  test("RSS feeds are valid and discoverable", async ({ page, request }) => {
    for (const path of ["/rss.xml", "/news/rss.xml", "/gist/rss.xml", "/learn/rss.xml", "/africa/rss.xml", "/category/bitcoin/rss.xml"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toContain("application/rss+xml");
      expect(await parseXml(page, await res.text()), path).toBe(true);
    }
    const all = await (await request.get("/rss.xml")).text();
    expect(all).toContain("<title>Sponsored: How ExamplePay makes cross-border payments simpler</title>");
    expect(all).not.toContain("unpublished-draft");
    expect((await request.get("/category/nope/rss.xml")).status()).toBe(404);

    await page.goto("/");
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute("href", "/rss.xml");
    await page.goto("/gist");
    await expect(page.locator('link[rel="alternate"][href="/gist/rss.xml"]')).toHaveCount(1);
  });
});

test.describe("editorial pages and structured data", () => {
  test("about and editorial policy exist and are linked from every page", async ({ page, request }) => {
    expect((await request.get("/about")).status()).toBe(200);
    expect((await request.get("/editorial-policy")).status()).toBe(200);
    await page.goto(ARTICLE);
    // The publisher's publishingPrinciples URL in JSON-LD must resolve.
    const ld = await jsonLd(page);
    expect(JSON.stringify(ld)).not.toContain("publishingPrinciples");
    await page.goto("/");
    const org = (await jsonLd(page)).find((d) => d["@type"] === "NewsMediaOrganization");
    expect(org?.["publishingPrinciples"]).toBe("https://coingist.test/editorial-policy");
    await page.getByRole("contentinfo").getByRole("link", { name: "Editorial policy" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Editorial policy");
  });

  test("sponsored stories are marked as advertiser content", async ({ page }) => {
    await page.goto(SPONSORED);
    const article = (await jsonLd(page)).find((d) => String(d["@type"]).includes("Article"));
    expect(article).toMatchObject({ "@type": "AdvertiserContentArticle", sponsor: { name: "ExamplePay (fictional)" } });
  });
});

test.describe("ads and analytics", () => {
  test("articles show a labelled ad that counts clicks and is marked sponsored", async ({ page, request }) => {
    await page.goto(ARTICLE);
    const ad = page.getByRole("complementary", { name: "Advertisement" });
    await expect(ad.getByText("Advertisement from ExamplePay (fictional)")).toBeVisible();
    const link = ad.getByRole("link");
    await expect(link).toHaveAttribute("rel", "sponsored noopener");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/go\/ad\/[0-9a-f-]{36}$/);
    const res = await request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe("https://example.com/");
    expect((await request.get("/go/ad/00000000-0000-4000-8000-000000000000", { maxRedirects: 0 })).status()).toBe(404);
  });

  test("sponsored stories carry no ads", async ({ page }) => {
    await page.goto(SPONSORED);
    await expect(page.getByRole("complementary", { name: "Advertisement" })).toHaveCount(0);
  });

  test("an unbooked home slot promotes the newsletter", async ({ page }) => {
    await page.goto("/");
    const promo = page.getByRole("complementary", { name: "From CoinGist" });
    await expect(promo.getByRole("link", { name: /Get the Daily Gist newsletter/ })).toHaveAttribute("href", "/newsletter");
  });

  test("analytics is off unless configured", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('script[data-domain]')).toHaveCount(0);
  });
});

test.describe("content security policy", () => {
  test("is strict and nothing on the site violates it", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(e.message));

    const res = await page.goto("/");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-inline");

    const second = await page.request.get("/");
    expect(second.headers()["content-security-policy"]).not.toBe(csp); // fresh nonce per response

    await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).click();
    await page.goto(ARTICLE);
    await page.goto("/newsletter");
    expect(problems).toEqual([]);
  });
});

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const path of ["/", ARTICLE, "/africa", "/author/amara-okafor", SPONSORED, "/newsletter", "/editorial-policy", "/advertise", "/privacy", "/terms", "/search?q=stablecoin", "/does-not-exist"]) {
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

test.describe("launch pages and price ticker", () => {
  test("advertise, privacy and terms are linked from the footer, indexable and in the sitemap", async ({ page, request }) => {
    for (const [name, path, heading] of [
      ["Advertise", "/advertise", "Advertise with CoinGist"],
      ["Privacy", "/privacy", "Privacy policy"],
      ["Terms", "/terms", "Terms of use"],
    ] as const) {
      await page.goto("/");
      await page.getByRole("contentinfo").getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
    }
    const sitemap = await (await request.get("/sitemap-pages.xml")).text();
    for (const path of ["/advertise", "/privacy", "/terms"]) expect(sitemap).toContain(`https://coingist.test${path}</loc>`);
  });

  test("privacy policy names the cookies the site actually sets", async ({ page }) => {
    await page.goto("/privacy");
    for (const name of ["theme", "cg_signed_in", "Plausible", "Beehiiv", "Supabase"]) await expect(page.locator("main")).toContainText(name);
  });

  test("the price ticker shows labelled sample prices with direction in words", async ({ page }) => {
    await page.goto("/");
    const ticker = page.getByRole("region", { name: "Crypto prices" });
    await expect(ticker).toBeVisible();
    await expect(ticker.getByRole("listitem")).toHaveCount(6);
    await expect(ticker.getByRole("listitem").first()).toContainText("BTC");
    await expect(ticker.getByRole("listitem").first()).toContainText("$64,000");
    await expect(ticker.getByRole("listitem").first()).toContainText("up 1.8%");
    await expect(ticker.getByRole("listitem").nth(1)).toContainText("down 0.9%");
  });
});
