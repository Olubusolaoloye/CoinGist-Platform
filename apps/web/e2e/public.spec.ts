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
    const listing = (await request.get("/news")).headers();
    expect(listing["cache-control"]).toContain("s-maxage=60");
    // Netlify's shared cache, kept per theme cookie so nobody gets the wrong colour scheme.
    expect(listing["netlify-cdn-cache-control"]).toBe("public, durable, s-maxage=60, stale-while-revalidate=604800");
    expect(listing["netlify-vary"]).toBe("query,cookie=theme");
    const missing = (await request.get("/news/unpublished-draft-never-visible")).headers();
    expect(missing["cache-control"]).toBe("no-store");
    expect(missing["netlify-cdn-cache-control"]).toBeUndefined();
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

test.describe("hosting", () => {
  // Netlify inserts a comment (and line breaks) at the top of <head>. That used to break
  // hydration on every page (React #418): the page was rebuilt in the browser and taps were lost.
  test("pages still hydrate and links work when the host injects a comment into <head>", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route((url) => url.pathname === "/", async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(
        '<meta charSet="utf-8"/>',
        '<meta charSet="utf-8"/>\n<!-- This site is hosted on Netlify.\n     Anyone can build and deploy a site like this one. -->',
      );
      await route.fulfill({ response: res, body });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "About" }).first().click();
    await expect(page).toHaveURL(/\/about$/);
    expect(errors).toEqual([]);
  });
});

test.describe("lighter glass", () => {
  test("phones with 2 GB of memory or less get glass without the live blur", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { get: () => 2 }));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-lite-glass", "");
    const blur = await page.locator(".glass").first().evaluate((e) => getComputedStyle(e).backdropFilter);
    expect(blur).toBe("none");
  });

  test("other devices keep the frosted glass", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).not.toHaveAttribute("data-lite-glass", "");
    const blur = await page.locator(".glass").first().evaluate((e) => getComputedStyle(e).backdropFilter);
    expect(blur).toContain("blur");
  });
});

test.describe("home and search", () => {
  test("spotlight changes story on request, beside today's gist and editors' picks", async ({ page, isMobile }) => {
    await page.goto("/");
    const spot = page.getByRole("region", { name: "Spotlight" });
    const slides = spot.locator('[aria-roledescription="slide"]');
    expect(await slides.count()).toBeGreaterThan(1);
    await expect(slides.first()).toHaveAttribute("data-active", "true");
    // Hidden slides don't download their photo up front (at most the next one is preloaded).
    const count = await slides.count();
    if (count > 2) await expect(slides.nth(count - 1).locator("img")).toHaveCount(0);
    await spot.getByRole("button", { name: /^Story 2 of/ }).click();
    await expect(slides.nth(1)).toHaveAttribute("data-active", "true");
    await expect(slides.first()).toHaveAttribute("data-active", "false");
    const gist = page.getByRole("region", { name: "Today's gist in 30 seconds" });
    await expect(gist.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Markets today" })).toBeVisible();
    // Prices are in US dollars only.
    await expect(page.getByRole("region", { name: "Markets today" })).not.toContainText("₦");
    await expect(page.getByRole("region", { name: "Crypto prices" })).not.toContainText("₦");
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

  test("an ad keeps its slot's shape, whatever size the image is", async ({ page }) => {
    await page.goto(ARTICLE);
    const box = await page.getByRole("complementary", { name: "Advertisement" }).getByRole("link").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeCloseTo(3, 1); // article-end is 1200 × 400
  });

  test("the advertise page shows every placement and its image size", async ({ page }) => {
    await page.goto("/advertise");
    for (const [name, size] of [["Home page banner", "1200 × 250"], ["End of story", "1200 × 400"], ["Newsletter sponsor", "600 × 200"]]) {
      const card = page.locator("div.glass").filter({ has: page.getByRole("heading", { name: name!, level: 3 }) });
      await expect(card).toContainText(size!);
    }
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
    for (const path of ["/", ARTICLE, "/africa", "/author/amara-okafor", SPONSORED, "/newsletter", "/editorial-policy", "/advertise", "/privacy", "/terms", "/search?q=stablecoin", "/events", "/events/lagos-blockchain-summit", "/opportunities", "/opportunities/payments-builder-grant", "/does-not-exist"]) {
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

test.describe("homepage motion", () => {
  test("spotlight, Just in and the price ticker move on their own, and can be paused", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await page.waitForLoadState("networkidle"); // hydrated: the timers below are the page's own
    const spot = page.getByRole("region", { name: "Spotlight" });
    const slides = spot.locator('[aria-roledescription="slide"]');
    await expect(slides.first()).toHaveAttribute("data-active", "true");
    await expect(spot.getByRole("button", { name: "Pause spotlight stories" })).toBeEnabled();
    await page.clock.runFor(7_500);
    await expect(slides.nth(1)).toHaveAttribute("data-active", "true");

    // Paused: it stays put.
    await spot.getByRole("button", { name: "Pause spotlight stories" }).click();
    await page.mouse.move(0, 0); // stop hovering, so only the pause holds it
    await page.clock.runFor(20_000);
    await expect(slides.nth(1)).toHaveAttribute("data-active", "true");
    await expect(spot.getByRole("button", { name: "Play spotlight stories" })).toHaveAttribute("aria-pressed", "true");

    // Just in scrolls along by itself.
    const justIn = page.getByRole("region", { name: "Just in" }).getByRole("list");
    const before = await justIn.evaluate((el) => el.scrollLeft);
    await page.clock.runFor(4_500);
    await expect.poll(() => justIn.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
    // ...and lines up on the start of a headline, never mid-word (smooth scrolling runs in real time).
    await expect
      .poll(() =>
        justIn.evaluate((el) =>
          Array.from(el.children).some((li) => Math.abs((li as HTMLElement).offsetLeft - el.scrollLeft) <= 2) ||
          el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
        ),
      )
      .toBe(true);

    // The ticker runs as a marquee, with no source line, and pauses on request.
    const ticker = page.getByRole("region", { name: "Crypto prices" });
    await expect(ticker).not.toContainText("CoinGecko");
    await expect(ticker).not.toContainText("may be delayed");
    const track = ticker.locator(".marquee-track");
    expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe("marquee");
    await ticker.getByRole("button", { name: "Pause prices" }).click();
    expect(await track.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
  });

  test("nothing moves for readers who prefer reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.goto("/");
    const slides = page.getByRole("region", { name: "Spotlight" }).locator('[aria-roledescription="slide"]');
    await page.clock.runFor(20_000);
    await expect(slides.first()).toHaveAttribute("data-active", "true");
    expect(await page.locator(".marquee-track").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await expect(page.getByRole("button", { name: "Pause spotlight stories" })).toHaveCount(0);
  });
});

test.describe("events and opportunities", () => {
  test("events: upcoming soonest first, past on its own tab, a detail page with structured data and a calendar file", async ({ page, request }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Events");
    const titles = await page.getByRole("main").getByRole("heading", { level: 3 }).allInnerTexts();
    expect(titles).toEqual(["Stablecoins 101 live class (sample)", "Lagos Blockchain Summit (sample)"]);
    await page.getByRole("link", { name: "Past", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nairobi crypto meetup (sample)" })).toBeVisible();

    await page.goto("/events/lagos-blockchain-summit");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lagos Blockchain Summit (sample)");
    await expect(page.getByText("Lagos, Nigeria")).toBeVisible();
    await expect(page.getByRole("link", { name: /Official event page/ })).toHaveAttribute("rel", "noopener nofollow");
    const ld = (await jsonLd(page)).find((d) => d["@type"] === "Event");
    expect(ld).toMatchObject({ name: "Lagos Blockchain Summit (sample)", location: { "@type": "Place", name: "Lagos, Nigeria" } });

    const ics = await request.get("/events/lagos-blockchain-summit/calendar.ics");
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    const body = await ics.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Lagos Blockchain Summit (sample)");
    expect((await request.get("/events/no-such-event")).status()).toBe(404);
  });

  test("opportunities: open and closed tabs, type filter, safety warning and a checked date", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByRole("complementary", { name: "Stay safe" })).toContainText("Never share your seed phrase");
    await expect(page.getByRole("heading", { name: "Payments builder grant (sample)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Testnet points airdrop (sample)" })).toHaveCount(0);
    await page.getByRole("link", { name: "Closed", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Testnet points airdrop (sample)" })).toBeVisible();
    await page.goto("/opportunities?type=airdrop");
    await expect(page.getByText("No open opportunities right now")).toBeVisible();

    await page.goto("/opportunities/payments-builder-grant");
    await expect(page.getByText("Up to $10,000")).toBeVisible();
    await expect(page.getByText(/Checked by the CoinGist editors on/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to the official page/ })).toBeVisible();
    await page.goto("/opportunities/testnet-points-airdrop");
    await expect(page.getByText("This opportunity has closed.")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("the home page shows upcoming events and open opportunities; both are in the menu and the sitemap", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Upcoming events" }).getByRole("heading", { level: 3 }).first()).toHaveText("Stablecoins 101 live class (sample)");
    await expect(page.getByRole("region", { name: "Airdrops & opportunities" })).toContainText("Payments builder grant (sample)");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
    const sitemap = await (await request.get("/sitemap-pages.xml")).text();
    expect(sitemap).toContain("/events/lagos-blockchain-summit</loc>");
    expect(sitemap).toContain("/opportunities</loc>");
  });
});

test.describe("launch pages and price ticker", () => {
  test("a form post that isn't a form gets a 400, not a server error", async ({ request }) => {
    for (const path of ["/newsletter", "/resources/theme"]) {
      const res = await request.post(path, { headers: { "content-type": "text/plain" }, data: "junk" });
      expect(res.status(), path).toBe(400);
    }
  });

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
