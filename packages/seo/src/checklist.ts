import type { RichTextNode } from "@coingist/types";

export interface ChecklistInput {
  type: "news" | "gist" | "learn" | "sponsored";
  title: string;
  slug: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  summaryBullets: string[];
  heroImage: { url: string; alt: string } | null;
  categorySlug: string | null;
  body: RichTextNode;
}

export type CheckStatus = "pass" | "warn" | "fail";
export interface Check {
  id: string;
  status: CheckStatus;
  /** Plain sentence shown to the writer: what to do, not just what's wrong. */
  message: string;
}

/** Minimum body length by section. Gist is short by design. */
const MIN_WORDS: Record<ChecklistInput["type"], number> = { news: 250, gist: 80, learn: 400, sponsored: 250 };

function walk(node: RichTextNode | undefined, visit: (n: RichTextNode) => void) {
  if (!node) return;
  visit(node);
  for (const c of node.content ?? []) walk(c, visit);
}

export function bodyStats(body: RichTextNode) {
  let words = 0;
  let h2 = 0;
  let internalLinks = 0;
  let externalLinks = 0;
  let imagesMissingAlt = 0;
  walk(body, (n) => {
    if (n.type === "text" && n.text) words += n.text.trim().split(/\s+/).filter(Boolean).length;
    if (n.type === "heading") h2 += 1;
    if (n.type === "image" && !String(n.attrs?.["alt"] ?? "").trim()) imagesMissingAlt += 1;
    for (const m of n.marks ?? []) {
      if (m.type !== "link") continue;
      const href = String(m.attrs?.["href"] ?? "");
      if (href.startsWith("/")) internalLinks += 1;
      else externalLinks += 1;
    }
  });
  return { words, headings: h2, internalLinks, externalLinks, imagesMissingAlt };
}

/** Live SEO and editorial checklist shown in Studio's SEO panel. */
export function seoChecklist(p: ChecklistInput): Check[] {
  const checks: Check[] = [];
  const add = (id: string, status: CheckStatus, message: string) => checks.push({ id, status, message });
  const stats = bodyStats(p.body);
  const title = (p.seoTitle ?? p.title).trim();
  const description = (p.seoDescription ?? p.excerpt ?? "").trim();

  if (title.length < 30) add("title-length", "warn", `Search title is ${title.length} characters. Aim for 30–60 so it says enough.`);
  else if (title.length > 60) add("title-length", "warn", `Search title is ${title.length} characters. Google cuts off around 60.`);
  else add("title-length", "pass", `Search title is ${title.length} characters.`);

  if (!description) add("description", "fail", "Add an excerpt or meta description. It's the snippet under your link in search and social.");
  else if (description.length < 70) add("description", "warn", `Description is ${description.length} characters. Aim for 70–160.`);
  else if (description.length > 160) add("description", "warn", `Description is ${description.length} characters. Search engines cut off after about 160.`);
  else add("description", "pass", `Description is ${description.length} characters.`);

  if (p.slug.length > 60) add("slug", "warn", "Shorten the URL slug to 60 characters or fewer.");
  else if (/^untitled/.test(p.slug)) add("slug", "fail", "Set a descriptive URL slug.");
  else add("slug", "pass", "URL slug is short and descriptive.");

  if (!p.heroImage) add("hero-image", "warn", "Add a hero image. Stories without one get fewer clicks from social and Discover.");
  else if (!p.heroImage.alt.trim()) add("hero-image", "fail", "Describe the hero image in its alt text.");
  else add("hero-image", "pass", "Hero image has alt text.");

  if (stats.imagesMissingAlt > 0) add("image-alt", "fail", `${stats.imagesMissingAlt} image(s) in the story need alt text.`);

  if (!p.categorySlug) add("category", "fail", "Choose a category.");
  else add("category", "pass", "Category set.");

  const bullets = p.summaryBullets.filter((b) => b.trim());
  if (bullets.length < 2) add("gist", "fail", "Write at least two gist bullets. They show at the top of the story.");
  else add("gist", "pass", `${bullets.length} gist bullets.`);

  const min = MIN_WORDS[p.type];
  if (stats.words < min) add("length", "warn", `The story is ${stats.words} words. ${p.type === "gist" ? "Gists" : "Stories"} usually need at least ${min}.`);
  else add("length", "pass", `${stats.words} words.`);

  if (stats.internalLinks === 0) add("internal-links", "warn", "Link to at least one related CoinGist story or guide.");
  else add("internal-links", "pass", `${stats.internalLinks} internal link(s).`);

  if (stats.words >= 400 && stats.headings === 0) add("headings", "warn", "Break up longer stories with subheadings.");

  return checks;
}

export function checklistScore(checks: Check[]) {
  return {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };
}
