import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WEB = "http://localhost:4175";
const WRITER = "Amara Okafor";
const EDITOR = "Tunde Bello";
const ADMIN = "Dev Admin";

async function signIn(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Sign in as ${name}`) }).click();
  await expect(page).toHaveURL(/\/posts$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function createPost(page: Page, title: string, type = "news") {
  await page.getByRole("link", { name: "New post" }).click();
  await page.getByLabel("Headline").fill(title);
  await page.getByRole("radio", { name: new RegExp(`^${type}`, "i") }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/);
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

async function save(page: Page) {
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("status").first()).toHaveText("All changes saved");
}

test.describe("access", () => {
  test("signed-out visitors go to sign-in and come back after", async ({ page }) => {
    await page.goto("/review");
    await expect(page).toHaveURL(/\/login\?next=%2Freview/);
    await page.getByRole("button", { name: `Sign in as ${EDITOR}` }).click();
    await expect(page).toHaveURL(/\/review$/);
  });

  test("readers are turned away", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Sign in as Sample Reader/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    await expect(page.getByText(/Studio is for CoinGist writers/)).toBeVisible();
  });

  test("writers don't see editor or admin tools", async ({ page }) => {
    await signIn(page, WRITER);
    await expect(page.getByRole("link", { name: "Review queue" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    for (const path of ["/review", "/audit"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    }
  });

  test("blocks cross-site form posts", async ({ page, request }) => {
    await signIn(page, WRITER);
    const cookies = await page.context().cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // A foreign Origin is rejected by React Router itself (400); a missing Origin by our check (403).
    const attempts: Array<Record<string, string>> = [{ origin: "https://evil.example", cookie }, { cookie }];
    for (const headers of attempts) {
      const res = await request.post("/posts/new", { headers, form: { title: "CSRF attempt", type: "news" }, maxRedirects: 0 });
      expect([400, 403]).toContain(res.status());
    }
    await page.goto("/posts");
    await expect(page.getByRole("link", { name: "CSRF attempt" })).toHaveCount(0);
  });
});

test.describe("editorial workflow", () => {
  test("writer drafts and submits; editor requests changes; writer fixes; editor approves and publishes", async ({ page }) => {
    const title = `Cedi traders turn to stablecoins ${Date.now()}`;

    // Writer drafts.
    await signIn(page, WRITER);
    await createPost(page, title, "news");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Traders in Accra say stablecoins help them hold value. ");
    await page.getByRole("button", { name: "Link" }).click();
    await page.getByLabel("Text to show").fill("Read our stablecoin guide.");
    await page.getByLabel("Link address").fill("/learn/what-is-a-stablecoin");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByLabel("Category").selectOption("africa");
    await page.getByLabel("Excerpt").fill("Why traders in Accra are holding dollar stablecoins as the cedi swings.");
    await page.getByLabel("Gist bullet 1").fill("The cedi has been volatile");
    await page.getByLabel("Gist bullet 2").fill("Stablecoins are the workaround");
    await page.getByText("P2P", { exact: true }).click();

    const submit = page.getByRole("button", { name: "Submit for review" });
    await expect(submit).toBeDisabled();
    await save(page);
    await submit.click();
    await expect(page.getByText("This story is with an editor.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    const postUrl = page.url();
    await signOut(page);

    // Editor reviews and requests changes.
    await signIn(page, EDITOR);
    await page.getByRole("link", { name: "Review queue" }).click();
    await page.getByRole("link", { name: title }).click();
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.getByLabel("What needs to change?").fill("Add a quote from a trader.");
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByText("Changes requested").first()).toBeVisible();
    await signOut(page);

    // Writer sees the note, edits, resubmits.
    await signIn(page, WRITER);
    await page.goto(postUrl);
    await expect(page.getByText("Add a quote from a trader.")).toBeVisible();
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type('"It keeps my savings steady," one trader said.');
    await save(page);
    await page.getByRole("button", { name: "Mark resolved" }).click();
    await page.getByRole("button", { name: "Resubmit for review" }).click();
    await expect(page.getByText("In review").first()).toBeVisible();
    await signOut(page);

    // Editor approves and publishes.
    await signIn(page, EDITOR);
    await page.goto(postUrl);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(`Approved by`)).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    const live = page.getByRole("link", { name: /View on site/ });
    const href = await live.getAttribute("href");
    expect(href).toMatch(new RegExp(`^${WEB}/news/cedi-traders-turn-to-stablecoins-\\d+$`));

    // The public site shows it, server-rendered, with the gist and sanitised internal link.
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText("The cedi has been volatile")).toBeVisible();
    await expect(page.locator(".article-body").getByRole("link", { name: "Read our stablecoin guide." })).toHaveAttribute(
      "href",
      "/learn/what-is-a-stablecoin",
    );
    await expect(page.getByText("It keeps my savings steady")).toBeVisible();
  });

  test("opening a story doesn't count as an unsaved change", async ({ page }) => {
    await signIn(page, EDITOR);
    await page.getByRole("link", { name: /Everyone's posts/ }).click();
    await page.getByRole("link", { name: "What is a stablecoin? A beginner's guide" }).click();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page.getByRole("status").first()).toHaveText("All changes saved");
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  });

  test("editors can't approve their own stories", async ({ page }) => {
    await signIn(page, EDITOR);
    await createPost(page, `Editor's own story ${Date.now()}`);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Body.");
    await save(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("In review").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible();
  });
});

test.describe("editor", () => {
  test("requires alt text for images and rejects unsafe links", async ({ page }) => {
    await signIn(page, WRITER);
    await createPost(page, `Image test ${Date.now()}`);
    await page.locator(".ProseMirror").click();

    await page.getByRole("button", { name: "Image", exact: true }).click();
    await page.getByLabel("Image address").fill("https://example.com/chart.png");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Describe the image for people who can't see it.");
    await page.getByLabel("Alt text (required)").fill("Chart of cedi exchange rate");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.locator('.ProseMirror img[alt="Chart of cedi exchange rate"]')).toBeVisible();

    await page.getByRole("button", { name: "Link" }).click();
    await page.getByLabel("Text to show").fill("click me");
    await page.getByLabel("Link address").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("alert")).toHaveText("Use an https:// address or a path starting with /.");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("restores an earlier version from history", async ({ page }) => {
    await signIn(page, WRITER);
    const original = `Original headline ${Date.now()}`;
    await createPost(page, original);
    await page.getByLabel("Headline").fill("Rewritten headline");
    await save(page);
    await expect(page.getByRole("region", { name: "History" }).getByText(original)).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Restore" }).first().click();
    await expect(page.getByLabel("Headline")).toHaveValue(original);
  });

  test("warns before leaving with unsaved changes", async ({ page }) => {
    await signIn(page, WRITER);
    await createPost(page, `Unsaved ${Date.now()}`);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Not saved yet");
    await page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: "Posts" }).click();
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.locator(".ProseMirror")).toContainText("Not saved yet");
  });

  test("shows a validation error from the API", async ({ page }) => {
    await signIn(page, WRITER);
    await createPost(page, `Slug clash ${Date.now()}`);
    await page.getByLabel("URL slug").fill("what-is-a-stablecoin");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toHaveText("That URL slug is already used by another story.");
  });
});

test.describe("admin", () => {
  test("audit log shows workflow history", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit log");
    await expect(page.getByRole("cell", { name: "post.status_changed" }).first()).toBeVisible();
  });
});

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  test("login, posts and editor", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    };
    await page.goto("/login");
    await check("login");
    await page.getByRole("button", { name: `Sign in as ${EDITOR}` }).click();
    await check("posts");
    await page.getByRole("link", { name: "Review queue" }).click();
    await check("review");
    await createPost(page, `A11y ${Date.now()}`);
    await check("editor");
  });
});
