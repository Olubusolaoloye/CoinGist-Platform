import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ARTICLE = "/news/stablecoin-transfers-climb-remittances";

/** Each test uses its own seeded account, so parallel tests don't share saved state. */
/** Click and wait until the server has stored the change (the button updates optimistically). */
async function clickAndSettle(page: Page, name: string | RegExp) {
  const done = page.waitForResponse((r) => r.url().includes("/account/actions") && r.request().method() === "POST");
  await page.getByRole("button", { name }).click();
  expect((await done).ok()).toBe(true);
}

async function signIn(page: Page, name: string, from = "/") {
  await page.goto(from);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Sign in as ${name}`) }).click();
  await expect(page).not.toHaveURL(/\/account\/login/);
}

test.describe("reader accounts", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "Account flows run once, on desktop (the header menu link is checked on mobile below).");
  });

  test("signed out: Save asks you to sign in, then brings you back to save", async ({ page }) => {
    await page.goto(ARTICLE);
    const save = page.getByRole("link", { name: /^Save/ });
    await expect(save).toHaveAttribute("href", `/account/login?next=${encodeURIComponent(ARTICLE)}`);
    await save.click();
    await page.getByRole("button", { name: /Sign in as Sample Reader/ }).click();
    await expect(page).toHaveURL(ARTICLE);

    const button = page.getByRole("button", { name: /Saved? "Stablecoin transfers climb/ });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await clickAndSettle(page, /Saved? "Stablecoin transfers climb/);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toContainText("Saved");
    await page.reload();
    await expect(page.getByRole("button", { name: /Saved? "Stablecoin transfers climb/ })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account");
    const saved = page.getByRole("region", { name: /Saved stories/ });
    await expect(saved.getByRole("link", { name: /Stablecoin transfers climb/ })).toBeVisible();
    await saved.getByRole("button", { name: /Remove "Stablecoin transfers climb/ }).click();
    await expect(saved).toContainText("Nothing saved yet");
  });

  test("following a writer and a topic builds the For you feed", async ({ page }) => {
    await signIn(page, "Kwame Mensah", "/for-you");
    await expect(page).toHaveURL("/for-you");
    await expect(page.getByRole("heading", { name: "Follow a few topics to start your feed" })).toBeVisible();
    await clickAndSettle(page, "Follow Stablecoins");
    await expect(page.getByRole("button", { name: "Following Stablecoins" })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Topic: Stablecoins/).first()).toBeVisible();

    await page.goto("/author/zanele-dube");
    await clickAndSettle(page, "Follow Zanele Dube");
    await expect(page.getByRole("button", { name: "Following Zanele Dube" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/for-you");
    await expect(page.getByText(/Writer: Zanele Dube/).first()).toBeVisible();
    await expect(page.getByText(/Following: .*Stablecoins/)).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Unfollow Zanele Dube" }).click();
    await expect(page.getByRole("button", { name: "Unfollow Zanele Dube" })).toHaveCount(0);
    await page.goto("/category/stablecoins");
    await clickAndSettle(page, "Following Stablecoins");
    await expect(page.getByRole("button", { name: "Follow Stablecoins" })).toBeVisible();
  });

  test("personal pages are private and public pages stay cacheable when signed in", async ({ page, request }) => {
    const res = await request.get("/for-you", { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe("/account/login?next=%2Ffor-you");

    await signIn(page, "Amara Okafor");
    const forYou = await page.goto("/for-you");
    expect(forYou!.headers()["cache-control"]).toBe("private, no-store");
    expect(forYou!.headers()["netlify-cdn-cache-control"]).toBeUndefined();
    expect(forYou!.headers()["x-robots-tag"]).toContain("noindex");
    const article = await page.goto(ARTICLE);
    expect(article!.headers()["cache-control"]).toMatch(/^public/);
    expect(await article!.text()).not.toContain("amara@example.com");
  });

  test("blocks cross-site posts and signs out", async ({ page }) => {
    await signIn(page, "Tunde Bello");
    // The page's own cookies with a forged Origin: refused.
    const res = await page.request.post("/account/actions", { form: { intent: "save", postId: "00000000-0000-4000-8000-000000000000" }, headers: { Origin: "https://evil.example" } });
    expect(res.status()).toBe(403);

    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login\?next=%2Faccount/);
  });

  test("accessibility of sign-in and account pages", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    };
    await page.goto("/account/login");
    await check("login");
    await page.getByRole("button", { name: /Sign in as Dev Admin/ }).click();
    await expect(page).toHaveURL("/for-you");
    await check("for-you");
    await page.goto("/account");
    await check("account");
    await page.goto(ARTICLE);
    await expect(page.getByRole("button", { name: /Save "/ })).toBeEnabled();
    await check("article signed in");
  });
});

test("mobile: the menu offers sign-in", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/");
  await page.getByLabel("Menu").click();
  await page.getByRole("link", { name: "Sign in to save stories" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
});
