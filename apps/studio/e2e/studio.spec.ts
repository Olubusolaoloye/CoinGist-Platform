import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WEB = "http://localhost:4175";
const WRITER = "Amara Okafor";
const EDITOR = "Tunde Bello";
const ADMIN = "Dev Admin";

const HOME: Record<string, RegExp> = { [WRITER]: /\/posts$/, [EDITOR]: /\/dashboard$/, [ADMIN]: /\/admin$/ };

/** Signs in and lands on Posts (each role's own home page is checked in "dashboards"). */
async function signIn(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Sign in as ${name}`) }).click();
  await expect(page).toHaveURL(HOME[name] ?? /\/posts$/);
  await page.goto("/posts");
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
  test("subscribers page shows signups and retries failed syncs", async ({ page, request }) => {
    // A signup the (dev) newsletter tool rejects: "+fail" addresses simulate an outage.
    const res = await request.post("http://localhost:8789/v1/public/newsletter/subscribe", {
      data: { email: `outage+fail-${Date.now()}@example.com`, source: "footer" },
    });
    expect(res.status()).toBe(202);

    await signIn(page, ADMIN);
    await page.getByRole("link", { name: "Subscribers" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Subscribers");
    await expect(page.getByRole("term").filter({ hasText: "The Daily Gist" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("didn't reach the newsletter tool");
    await page.getByRole("button", { name: "Retry now" }).click();
    await expect(page.getByRole("status")).toContainText("The rest still failed");
    await page.getByRole("link", { name: "Show them" }).click();
    await expect(page.getByRole("cell", { name: /Failed: Simulated newsletter outage/ }).first()).toBeVisible();
  });

  test("editors can't see subscribers", async ({ page }) => {
    await signIn(page, EDITOR);
    await expect(page.getByRole("link", { name: "Subscribers" })).toHaveCount(0);
    await page.goto("/subscribers");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
  });

  test("audit log shows workflow history", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit log");
    await expect(page.getByRole("cell", { name: "post.status_changed" }).first()).toBeVisible();
  });
});

test.describe("sponsorship, ads and link safety", () => {
  test("a story linking to a blocked domain can't be approved, and the editor sees why", async ({ page }) => {
    const domain = `scam-${Date.now()}.example`;
    await signIn(page, EDITOR);
    await page.getByRole("link", { name: "Link safety" }).click();
    await page.getByLabel("Domain").fill(`https://www.${domain}/login`);
    await page.getByLabel("Why it's blocked").fill("Fake exchange (test)");
    await page.getByRole("button", { name: "Block domain" }).click();
    await expect(page.getByText(domain, { exact: true })).toBeVisible();
    await signOut(page);

    await signIn(page, WRITER);
    await createPost(page, `Blocked link story ${Date.now()}`);
    await page.locator(".ProseMirror").click();
    await page.getByRole("button", { name: "Link" }).click();
    await page.getByLabel("Text to show").fill("claim here");
    await page.getByLabel("Link address").fill(`https://app.${domain}/claim`);
    await page.getByRole("button", { name: "Apply" }).click();
    await save(page);
    await expect(page.getByRole("alert").filter({ hasText: "blocked domains" })).toContainText(`app.${domain}`);
    await page.getByRole("button", { name: "Submit for review" }).click();
    const url = page.url();
    await signOut(page);

    await signIn(page, EDITOR);
    await page.goto(url);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "links to blocked domains" })).toBeVisible();
    await expect(page.getByText("In review").first()).toBeVisible();
  });

  test("an order can't be accepted until vetting is complete", async ({ page }) => {
    await signIn(page, EDITOR);
    await page.getByRole("link", { name: "Sponsored" }).click();
    const sponsor = `Test Sponsor ${Date.now()}`;
    await page.getByLabel("Add a sponsor").fill(sponsor);
    await page.getByRole("button", { name: "Add sponsor" }).click();
    await expect(page.getByText("Sponsor added.")).toBeVisible();

    await page.getByLabel("Sponsor", { exact: true }).selectOption({ label: sponsor });
    await page.getByLabel("What they're buying").fill("Launch explainer");
    await page.getByLabel("Price").fill("1200");
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Launch explainer");

    await page.getByRole("button", { name: "Mark vetting" }).click();
    const accept = page.getByRole("button", { name: "Accept order" });
    await expect(accept).toBeDisabled();
    for (const box of await page.getByRole("checkbox").all()) await box.check();
    await page.getByRole("button", { name: "Save order" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  });

  test("ad bookings go live only after approval", async ({ page }) => {
    await signIn(page, EDITOR);
    await page.getByRole("link", { name: "Ads" }).click();
    const fmt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await page.getByLabel("Slot").selectOption({ label: "Weekly Wrap newsletter sponsor" });
    await page.getByLabel("Starts").fill(fmt(new Date(Date.now() - 3600_000)));
    await page.getByLabel("Ends").fill(fmt(new Date(Date.now() + 7 * 86_400_000)));
    await page.getByLabel("Image address").fill("https://cdn.example/banner.png");
    await page.getByLabel("Alt text").fill("Test banner");
    await page.getByLabel("Click-through address").fill("https://advertiser.example");
    await page.getByRole("button", { name: "Create booking" }).click();
    const slot = page.getByRole("region", { name: "Weekly Wrap newsletter sponsor" });
    await expect(slot.getByText("Awaiting approval")).toBeVisible();
    await slot.getByRole("button", { name: "Approve" }).click();
    await expect(slot.getByText("Live")).toBeVisible();
  });

  test("writers can see link safety but not sponsorship or ads", async ({ page }) => {
    await signIn(page, WRITER);
    await expect(page.getByRole("link", { name: "Link safety" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sponsored" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ads" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Block domain" })).toHaveCount(0);
    for (const path of ["/sponsored", "/ads"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    }
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
    await check("editor dashboard");
    await page.goto("/posts");
    await check("posts");
    await page.getByRole("link", { name: "Review queue" }).click();
    await check("review");
    for (const [name, path] of [["sponsored", "/sponsored"], ["ads", "/ads"], ["link safety", "/link-safety"]] as const) {
      await page.goto(path);
      await check(name);
    }
    await createPost(page, `A11y ${Date.now()}`);
    await check("editor");
  });

  test("AI assist panel and trending digest", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    };
    await signIn(page, EDITOR);
    await createPost(page, `A11y AI ${Date.now()}`);
    const ai = page.getByRole("region", { name: "AI assist" });
    for (const tab of ["Outline", "Gist", "SEO", "Links", "Check", "Share"]) {
      await ai.getByRole("tab", { name: tab }).click();
      await check(`ai ${tab}`);
    }
    await page.goto("/trending");
    await check("trending");
  });

  test("admin pages and writer earnings", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    };
    await signIn(page, ADMIN);
    for (const path of ["/admin", "/admin/team", "/admin/payouts", "/dashboard"]) {
      await page.goto(path);
      await check(path);
    }
    await signOut(page);
    await signIn(page, WRITER);
    await page.goto("/earnings");
    await check("/earnings");
  });
});

test.describe("dashboards", () => {
  test("each role lands on its own home page", async ({ page }) => {
    for (const [name, home] of Object.entries(HOME)) {
      await page.goto("/login");
      await page.getByRole("button", { name: new RegExp(`Sign in as ${name}`) }).click();
      await expect(page).toHaveURL(home);
      await signOut(page);
    }
  });

  test("editor dashboard: queues, calendar weeks and writer table", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: `Sign in as ${EDITOR}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Editor dashboard");
    await expect(page.getByRole("region", { name: "Review queue" })).toBeVisible();
    const cal = page.getByRole("region", { name: "Editorial calendar" });
    await expect(cal.getByRole("listitem").filter({ hasText: "Today" })).toHaveCount(1);
    await expect(cal.locator("ol > li")).toHaveCount(14);
    await cal.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL(/\?from=\d{4}-\d{2}-\d{2}$/);
    await expect(cal.getByRole("listitem").filter({ hasText: "Today" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Writers" }).getByRole("rowheader", { name: /Amara Okafor/ })).toBeVisible();
    await page.getByText("Show as a table").click();
    await expect(page.getByRole("region", { name: /Published per day/ }).getByRole("table")).toBeVisible();
  });

  test("writers and editors can't open admin pages; writers can't open the editor dashboard", async ({ page }) => {
    await signIn(page, WRITER);
    for (const link of ["Admin", "Dashboard"]) await expect(page.getByRole("link", { name: link, exact: true })).toHaveCount(0);
    for (const path of ["/dashboard", "/admin", "/admin/team", "/admin/payouts"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    }
    await signOut(page);
    await signIn(page, EDITOR);
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    for (const path of ["/admin", "/admin/payouts"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    }
  });

  test("admin records, approves and pays a writer, who then sees it under My earnings", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const note = `E2E bonus ${Date.now()}`;
    await signIn(page, ADMIN);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin");
    await page.getByRole("link", { name: "Payouts", exact: true }).click();

    const other = page.getByRole("region", { name: "Other payment" });
    await other.getByLabel("Writer").selectOption({ label: WRITER });
    await other.getByLabel("Amount").fill("12.5");
    await other.getByLabel("Currency").fill("usd");
    await other.getByLabel("Note").fill(note);
    await other.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("status")).toHaveText(/Payment recorded/);

    const row = page.getByRole("row").filter({ hasText: note });
    await expect(row).toContainText("$12.50");
    await row.getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByRole("status")).toHaveText("Payment approved.");
    await row.getByRole("button", { name: /^Mark paid/ }).click();
    await expect(page.getByRole("status")).toHaveText("Marked as paid.");
    await expect(row).toContainText("Paid");
    await expect(row.getByRole("button")).toHaveCount(0);

    // Recording a payment for a published story takes it off the unpaid list.
    const unpaid = page.getByRole("region", { name: "Published, not yet paid" });
    const first = unpaid.getByRole("listitem").first();
    const title = (await first.locator("p").first().textContent())!;
    await first.getByRole("textbox", { name: /Amount/ }).fill("40");
    await first.getByRole("button", { name: /Record payment/ }).click();
    await expect(page.getByRole("status")).toHaveText(/Payment recorded/);
    await expect(unpaid.getByText(title, { exact: true })).toHaveCount(0);

    await signOut(page);
    await signIn(page, WRITER);
    await page.getByRole("link", { name: "My earnings" }).click();
    await expect(page.getByRole("row").filter({ hasText: note })).toContainText("Paid");
  });

  test("admin changes a role and suspends an account, and can't lock themselves out", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page, ADMIN);
    await page.goto("/admin/team");
    const reader = page.getByRole("row").filter({ hasText: "Sample Reader" });
    await reader.getByRole("combobox", { name: "Role for Sample Reader" }).selectOption("writer");
    await reader.getByRole("button", { name: "Save role for Sample Reader" }).click();
    await expect(page.getByRole("status")).toHaveText("Sample Reader is now writer.");
    await expect(reader.getByText("Not set up")).toBeVisible(); // staff without 2FA are flagged
    await reader.getByRole("combobox", { name: "Role for Sample Reader" }).selectOption("reader");
    await reader.getByRole("button", { name: "Save role for Sample Reader" }).click();
    await expect(page.getByRole("status")).toHaveText("Sample Reader is now reader.");

    await reader.getByRole("button", { name: "Suspend Sample Reader" }).click();
    await expect(page.getByRole("status")).toHaveText(/suspended/);
    await reader.getByRole("button", { name: "Reactivate Sample Reader" }).click();
    await expect(page.getByRole("status")).toHaveText("Sample Reader is active again.");

    const me = page.getByRole("row").filter({ hasText: "(you)" });
    await expect(me.getByRole("button", { name: /Suspend/ })).toHaveCount(0);
    await me.getByRole("combobox").selectOption("editor");
    await me.getByRole("button", { name: /Save role/ }).click();
    await expect(page.getByRole("alert")).toHaveText(/at least one admin/);
  });
});

test.describe("AI assist (offline sample provider)", () => {
  const BODY =
    "Stablecoin transfers rose 40% in Nigeria last quarter, according to traders in Lagos. " +
    "Fees for sending money home are the main reason people are switching. " +
    "Regulators are drafting rules for exchanges, and some say this token offers guaranteed returns. " +
    "The central bank has not commented on the figures yet.";

  async function storyWithBody(page: Page) {
    await signIn(page, WRITER);
    await createPost(page, `AI test ${Date.now()}`);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(BODY);
    await save(page);
    return page.getByRole("region", { name: "AI assist" });
  }

  test("suggests a gist the writer chooses to use, and flags the story AI-assisted", async ({ page }) => {
    const ai = await storyWithBody(page);
    await expect(ai.getByText(/Sample mode/)).toBeVisible();
    await ai.getByRole("tab", { name: "Gist" }).click();
    await ai.getByRole("button", { name: "Suggest the gist" }).click();
    await expect(ai.getByRole("listitem").first()).toContainText("Stablecoin transfers rose 40%");
    // Using AI doesn't change the story by itself: still saved, but now flagged.
    await expect(page.getByRole("status").first()).toHaveText("All changes saved");
    await expect(page.getByRole("checkbox", { name: /AI tools helped write this/ })).toBeChecked();
    await ai.getByRole("button", { name: "Use as the gist" }).click();
    await expect(ai.getByRole("status")).toHaveText(/Gist added/);
    await expect(page.getByRole("status").first()).toHaveText("Unsaved changes");
    await save(page);
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /AI tools helped write this/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /AI tools helped write this/ })).toBeDisabled();
    await page.getByRole("region", { name: "AI assist" }).getByText(/AI used on this story/).click();
    await expect(page.getByRole("region", { name: "AI assist" })).toContainText("Gist in 30 seconds by Amara Okafor");
  });

  test("outline goes into the story only when asked; checks run on the text", async ({ page }) => {
    const ai = await storyWithBody(page);
    await ai.getByLabel("Your notes").fill("Traders in Lagos say fees fell. Exchanges expect new rules next month.");
    await ai.getByRole("button", { name: "Suggest an outline" }).click();
    await expect(ai.getByText("What happened")).toBeVisible();
    await expect(page.locator(".ProseMirror h2")).toHaveCount(0);
    await ai.getByRole("button", { name: "Add outline to the end of the story" }).click();
    await expect(page.locator(".ProseMirror h2").first()).toHaveText("What happened");

    await ai.getByRole("tab", { name: "Check" }).click();
    await expect(ai.getByText("Breaks the editorial policy")).toBeVisible();
    await expect(ai).toContainText('"guaranteed returns"');
    await ai.getByRole("button", { name: "Check claims with AI" }).click();
    await expect(ai.locator("q").first()).toContainText("rose 40%");

    await ai.getByRole("tab", { name: "Links" }).click();
    await expect(ai.getByRole("button", { name: /Copy link to "/ }).first()).toBeVisible();

    await ai.getByRole("tab", { name: "Share" }).click();
    await ai.getByLabel("Format").selectOption("x_thread");
    await ai.getByRole("button", { name: "Write a x thread" }).click();
    await expect(ai.getByRole("listitem").last()).toContainText(/Read the full story: http:\/\/localhost:\d+\/news\/ai-test-/);
  });

  test("editors get a trending digest that can start a story; writers can't", async ({ page }) => {
    await signIn(page, WRITER);
    await expect(page.getByRole("link", { name: "Trending" })).toHaveCount(0);
    await page.goto("/trending");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don't have access to this");
    await signOut(page);

    await signIn(page, EDITOR);
    await page.getByRole("link", { name: "Trending" }).click();
    // No feeds are configured locally, so the digest needs notes.
    await page.getByRole("button", { name: "Build the digest" }).click();
    await expect(page.getByRole("alert")).toContainText("No news feeds are configured");
    await page.getByLabel(/Anything else on your radar/).fill("Kenya is consulting on new exchange licensing rules.");
    await page.getByRole("button", { name: "Build the digest" }).click();
    const topic = page.getByRole("listitem").filter({ hasText: "Kenya is consulting" }).first();
    await expect(topic).toBeVisible();
    await topic.getByRole("link", { name: /Start a story/ }).click();
    await expect(page.getByLabel("Headline")).toHaveValue(/Kenya is consulting on new exchange licensing rules/);
  });
});
