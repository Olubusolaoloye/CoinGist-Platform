import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDevData } from "@coingist/db/dev-seed";
import type { Role } from "@coingist/types";
import type { App } from "../src/app.js";
import { bearer, setup, tokenFor, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let users: Record<Role, TestUser>;
let editor2: TestUser;

beforeAll(async () => {
  ({ t, app } = await setup());
  await seedDevData(t.pg);
  users = {
    reader: await t.createUser(),
    writer: await t.createUser({ role: "writer" }),
    editor: await t.createUser({ role: "editor" }),
    admin: await t.createUser({ role: "admin" }),
  };
  editor2 = await t.createUser({ role: "editor" });
});
afterAll(() => t.close());

async function call(method: string, path: string, user: TestUser | null, body?: unknown, aal: "aal1" | "aal2" = "aal2") {
  const headers: Record<string, string> = user ? bearer(await tokenFor(user, { aal })) : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

describe("studio access", () => {
  it.each([
    ["anon", null, 401],
    ["reader", "reader", 403],
    ["writer without 2FA", "writer-aal1", 403],
    ["writer", "writer", 200],
    ["editor", "editor", 200],
  ] as const)("GET /v1/studio/posts as %s -> %i", async (_label, who, status) => {
    const user = who === null ? null : users[who.replace("-aal1", "") as Role];
    const res = await call("GET", "/v1/studio/posts", user, undefined, who === "writer-aal1" ? "aal1" : "aal2");
    expect(res.status).toBe(status);
    if (status === 200) expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("only editors and admins can open the review queue", async () => {
    expect((await call("GET", "/v1/studio/review-queue", users.writer)).status).toBe(403);
    expect((await call("GET", "/v1/studio/review-queue", users.editor)).status).toBe(200);
    expect((await call("GET", "/v1/studio/review-queue", users.admin)).status).toBe(200);
  });
});

describe("studio flow over HTTP", () => {
  it("draft → review → changes → approve → publish → visible on the public API", async () => {
    const created = await call("POST", "/v1/studio/posts", users.writer, { type: "gist", title: "Studio flow story" });
    expect(created.status).toBe(201);
    const { post } = (await created.json()) as { post: { id: string; slug: string } };

    const patch = await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, {
      excerpt: "Short summary",
      summaryBullets: ["One", "Two"],
      categorySlug: "africa",
      tagSlugs: ["p2p"],
      heroImageUrl: "/sample/cover-1.svg",
      heroImageAlt: "Illustration",
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Body text." }] },
          { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        ],
      },
    });
    expect(patch.status).toBe(200);
    const saved = (await patch.json()) as { post: { body: unknown } };
    expect(JSON.stringify(saved.post.body)).not.toContain("javascript");

    expect((await call("POST", `/v1/studio/posts/${post.id}/transition`, users.writer, { to: "in_review" })).status).toBe(200);

    const queue = (await (await call("GET", "/v1/studio/review-queue", users.editor)).json()) as { posts: Array<{ id: string }> };
    expect(queue.posts.map((p) => p.id)).toContain(post.id);

    // Writers cannot approve; editors can request changes with a note.
    expect((await call("POST", `/v1/studio/posts/${post.id}/transition`, users.writer, { to: "approved" })).status).toBe(403);
    expect(
      (await call("POST", `/v1/studio/posts/${post.id}/transition`, users.editor, { to: "changes_requested", note: "Cite the source." })).status,
    ).toBe(200);
    const comments = (await (await call("GET", `/v1/studio/posts/${post.id}/comments`, users.writer)).json()) as {
      comments: Array<{ body: string }>;
    };
    expect(comments.comments.map((c) => c.body)).toEqual(["Cite the source."]);

    await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, { excerpt: "Short summary, sourced" });
    await call("POST", `/v1/studio/posts/${post.id}/transition`, users.writer, { to: "in_review" });
    expect((await call("POST", `/v1/studio/posts/${post.id}/transition`, users.editor, { to: "approved" })).status).toBe(200);
    expect((await call("POST", `/v1/studio/posts/${post.id}/transition`, users.editor, { to: "published" })).status).toBe(200);

    const pub = await app.request(`/v1/public/posts/${post.slug}`);
    expect(pub.status).toBe(200);
    expect(await pub.json()).toMatchObject({ post: { title: "Studio flow story", type: "gist" } });

    // Published: writer can no longer edit; history exists.
    expect((await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, { title: "Sneaky edit" })).status).toBe(403);
    const audit = (await (await call("GET", `/v1/admin/audit-logs?entity=posts&entityId=${post.id}`, users.admin)).json()) as {
      logs: Array<{ metadata: { to: string } }>;
    };
    expect(audit.logs.map((l) => l.metadata.to).reverse()).toEqual([
      "in_review",
      "changes_requested",
      "in_review",
      "approved",
      "published",
    ]);
  });

  it("validates input", async () => {
    const { post } = (await (await call("POST", "/v1/studio/posts", users.writer, { title: "Validation" })).json()) as { post: { id: string } };
    const bad = [
      { status: "published" },
      { heroImageUrl: "https://x.test/a.png" },
      { slug: "Not A Slug" },
      { seoTitle: "x".repeat(71) },
      { summaryBullets: ["1", "2", "3", "4", "5", "6"] },
    ];
    for (const body of bad) {
      expect((await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call("PATCH", `/v1/studio/posts/not-a-uuid`, users.writer, { title: "x" })).status).toBe(400);
    expect((await call("POST", "/v1/studio/posts", users.writer, { title: "" })).status).toBe(400);
  });

  it("returns 404 for posts the caller can't see, 409 for slug clashes", async () => {
    const { post } = (await (await call("POST", "/v1/studio/posts", editor2, { title: "Editor two draft" })).json()) as { post: { id: string } };
    expect((await call("GET", `/v1/studio/posts/${post.id}`, users.writer)).status).toBe(404);
    expect((await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, { title: "x" })).status).toBe(404);

    const { post: mine } = (await (await call("POST", "/v1/studio/posts", users.writer, { title: "Clash" })).json()) as { post: { id: string } };
    const clash = await call("PATCH", `/v1/studio/posts/${mine.id}`, users.writer, { slug: "what-is-a-stablecoin" });
    expect(clash.status).toBe(409);
  });

  it("rejects oversized bodies", async () => {
    const res = await app.request("/v1/studio/posts", {
      method: "POST",
      headers: { ...bearer(await tokenFor(users.writer)), "content-type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(600_000) }),
    });
    expect(res.status).toBe(413);
  });
});

describe("story editor bundle", () => {
  it("returns the post, comments, history, taxonomy and link check in one response", async () => {
    const created = await call("POST", "/v1/studio/posts", users.writer, { type: "news", title: "Bundle story" });
    const { post } = (await created.json()) as { post: { id: string } };
    await call("PATCH", `/v1/studio/posts/${post.id}`, users.writer, { title: "Bundle story, edited" });
    await call("POST", `/v1/studio/posts/${post.id}/comments`, users.writer, { body: "Note to self" });

    const res = await call("GET", `/v1/studio/posts/${post.id}/editor`, users.writer);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const b = (await res.json()) as {
      post: { id: string; title: string };
      comments: Array<{ body: string; createdAt: string }>;
      revisions: Array<{ createdAt: string }>;
      categories: Array<{ slug: string }>;
      tags: Array<{ slug: string }>;
      blocked: unknown[];
    };
    expect(b.post).toMatchObject({ id: post.id, title: "Bundle story, edited" });
    expect(b.comments.map((c) => c.body)).toEqual(["Note to self"]);
    expect(new Date(b.comments[0]!.createdAt).toISOString()).toBe(b.comments[0]!.createdAt);
    expect(b.revisions.length).toBeGreaterThan(0);
    expect(b.categories.length).toBeGreaterThan(0);
    expect(b.tags.length).toBeGreaterThan(0);
    expect(b.blocked).toEqual([]);

    // Same rules as the separate endpoints: other writers can't see a draft, readers get 403.
    const other = await t.createUser({ role: "writer" });
    expect((await call("GET", `/v1/studio/posts/${post.id}/editor`, other)).status).toBe(404);
    expect((await call("GET", `/v1/studio/posts/${post.id}/editor`, users.reader)).status).toBe(403);
  });
});

describe("authors over HTTP", () => {
  const body = { name: "Kemi Writer", title: "Markets reporter", bio: "", avatarUrl: "", socials: { x: "https://x.com/kemi" }, expertise: ["Bitcoin"] };

  it("a writer saves their own profile and sees only themselves; editors see all staff", async () => {
    const saved = await call("PUT", `/v1/studio/authors/${users.writer.id}`, users.writer, body);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ slug: "kemi-writer" });
    const mine = (await (await call("GET", "/v1/studio/authors", users.writer)).json()) as { authors: Array<{ id: string }> };
    expect(mine.authors.map((x) => x.id)).toEqual([users.writer.id]);
    const all = (await (await call("GET", "/v1/studio/authors", users.editor)).json()) as { authors: Array<{ id: string; title: string | null }> };
    expect(all.authors.length).toBeGreaterThan(1);
    expect(all.authors.find((x) => x.id === users.writer.id)?.title).toBe("Markets reporter");
  });

  it("refuses edits to someone else from a writer, bad links, and readers", async () => {
    expect((await call("PUT", `/v1/studio/authors/${users.editor.id}`, users.writer, body)).status).toBe(403);
    expect((await call("PUT", `/v1/studio/authors/${users.writer.id}`, users.writer, { ...body, socials: { x: "javascript:alert(1)" } })).status).toBe(400);
    expect((await call("GET", "/v1/studio/authors", users.reader)).status).toBe(403);
  });

  it("only editors change a story's byline", async () => {
    const created = await call("POST", "/v1/studio/posts", users.writer, { type: "news", title: "Byline test story" });
    const { post } = (await created.json()) as { post: { id: string } };
    expect((await call("PUT", `/v1/studio/posts/${post.id}/author`, users.writer, { authorId: users.editor.id })).status).toBe(403);
    expect((await call("PUT", `/v1/studio/posts/${post.id}/author`, users.editor, { authorId: users.editor.id })).status).toBe(204);
    expect((await call("PUT", `/v1/studio/posts/${post.id}/author`, users.editor, { authorId: users.reader.id })).status).toBe(409);
  });
});

describe("events and opportunities over HTTP", () => {
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const event = {
    kind: "event", category: "conference", title: "Lagos Crypto Week", summary: "Three days of talks for builders and founders.",
    url: "https://lagoscryptoweek.example/", startsAt: soon, location: "Lagos, Nigeria",
  };

  it("writers draft, editors publish, and the public sees only published listings (cached)", async () => {
    const draft = await call("POST", "/v1/studio/listings", users.writer, event);
    expect(draft.status).toBe(201);
    const { listing } = (await draft.json()) as { listing: { id: string; slug: string; status: string } };
    expect(listing).toMatchObject({ slug: "lagos-crypto-week", status: "draft" });
    expect((await call("PUT", `/v1/studio/listings/${listing.id}`, users.writer, { ...event, status: "published" })).status).toBe(403);
    expect((await app.request("/v1/public/listings/event/lagos-crypto-week")).status).toBe(404);

    expect((await call("PUT", `/v1/studio/listings/${listing.id}`, users.editor, { ...event, status: "published" })).status).toBe(200);
    const pub = await app.request("/v1/public/listings?kind=event");
    expect(pub.headers.get("cache-control")).toContain("s-maxage");
    expect(((await pub.json()) as { items: Array<{ slug: string }> }).items.map((i) => i.slug)).toContain("lagos-crypto-week");
    const sitemap = (await (await app.request("/v1/public/sitemap")).json()) as { listings: Array<{ slug: string }> };
    expect(sitemap.listings.map((s) => s.slug)).toContain("lagos-crypto-week");
  });

  it("validates input and keeps readers out of Studio", async () => {
    expect((await call("POST", "/v1/studio/listings", users.editor, { ...event, url: "http://insecure.example" })).status).toBe(400);
    expect((await call("POST", "/v1/studio/listings", users.editor, { ...event, startsAt: "" })).status).toBe(400);
    expect((await call("POST", "/v1/studio/listings", users.editor, { ...event, kind: "opportunity" })).status).toBe(400);
    expect((await call("GET", "/v1/studio/listings", users.reader)).status).toBe(403);
    expect((await app.request("/v1/public/listings?kind=event&scope=open")).status).toBe(400);
  });

  it("an opportunity needs the safety checklist before it goes live", async () => {
    const body = { kind: "opportunity", category: "airdrop", title: "Testnet airdrop", summary: "Points for using the testnet before the deadline.", url: "https://project.example/airdrop" };
    const made = await call("POST", "/v1/studio/listings", users.editor, body);
    const { listing } = (await made.json()) as { listing: { id: string } };
    expect((await call("PUT", `/v1/studio/listings/${listing.id}`, users.editor, { ...body, status: "published" })).status).toBe(409);
    expect((await call("PUT", `/v1/studio/listings/${listing.id}`, users.editor, { ...body, status: "published", safetyChecked: true })).status).toBe(200);
  });
});
