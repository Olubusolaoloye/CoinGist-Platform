import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStudioRepository, publishDueScheduled, type StudioRepository } from "../src/studio.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let studio: StudioRepository;
let writer: TestUser, writer2: TestUser, editor: TestUser, reader: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  studio = createStudioRepository(t.db);
  writer = await t.createUser({ role: "writer" });
  writer2 = await t.createUser({ role: "writer" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser();
  await t.pg.query("insert into public.categories (slug, name) values ('bitcoin', 'Bitcoin')");
  await t.pg.query("insert into public.tags (slug, name) values ('p2p', 'P2P'), ('usdt', 'USDT')");
});
afterAll(() => t.close());

describe("drafting", () => {
  it("creates a draft owned by the writer with a slug from the title", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Naira hits new low!" });
    expect(post).toMatchObject({ slug: "naira-hits-new-low", status: "draft", author: { id: writer.id } });
  });

  it("picks a new slug when another writer's draft already uses it", async () => {
    const post = await studio.createPost(writer2.claims, { type: "news", title: "Naira hits new low" });
    expect(post.slug).toMatch(/^naira-hits-new-low-[a-z0-9]{6}$/);
  });

  it("refuses drafts from readers and from staff without 2FA", async () => {
    await expect(studio.createPost(reader.claims, { type: "news", title: "x" })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(studio.createPost(writer.claimsNoMfa, { type: "news", title: "y" })).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("updates content, sanitises the body, sets category and tags", async () => {
    const post = await studio.createPost(writer.claims, { type: "gist", title: "Draft" });
    const updated = await studio.updatePost(writer.claims, post.id, {
      title: "Draft v2",
      excerpt: "  short  ",
      summaryBullets: ["one", "two"],
      categorySlug: "bitcoin",
      tagSlugs: ["p2p", "usdt"],
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
          },
          { type: "script", content: [{ type: "text", text: "evil()" }] },
        ],
      },
    });
    expect(updated).toMatchObject({
      title: "Draft v2",
      excerpt: "  short  ",
      summaryBullets: ["one", "two"],
      category: { slug: "bitcoin" },
      tags: [{ slug: "p2p" }, { slug: "usdt" }],
    });
    expect(updated.body).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }, { type: "text", text: "evil()" }],
    });
    const revisions = await studio.listRevisions(writer.claims, post.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.title).toBe("Draft");
  });

  it("rejects unknown categories and tags", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Cats" });
    await expect(studio.updatePost(writer.claims, post.id, { categorySlug: "nope" })).rejects.toMatchObject({ kind: "invalid" });
    await expect(studio.updatePost(writer.claims, post.id, { tagSlugs: ["nope"] })).rejects.toMatchObject({ kind: "invalid" });
  });

  it("reports duplicate slugs as a conflict", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Unique story" });
    await expect(studio.updatePost(writer.claims, post.id, { slug: "naira-hits-new-low" })).rejects.toMatchObject({ kind: "conflict" });
  });
});

describe("access", () => {
  it("hides other writers' drafts (404) and blocks editing approved posts (403)", async () => {
    const other = await insertPost(t.pg, { authorId: writer2.id });
    expect(await studio.getPost(writer.claims, other)).toBeNull();
    await expect(studio.updatePost(writer.claims, other, { title: "x" })).rejects.toMatchObject({ kind: "not_found" });

    const approved = await insertPost(t.pg, { authorId: writer.id, status: "approved", approverId: editor.id });
    await expect(studio.updatePost(writer.claims, approved, { title: "x" })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(studio.updatePost(writer.claims, approved, { tagSlugs: ["p2p"] })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(studio.updatePost(editor.claims, approved, { title: "Editor fix" })).resolves.toMatchObject({ title: "Editor fix" });
  });

  it("lists my posts for writers and everything for editors", async () => {
    const mine = await studio.listPosts(writer.claims, { page: 1, pageSize: 50 });
    expect(mine.items.every((p) => p.author.id === writer.id || p.status === "published")).toBe(true);
    const all = await studio.listPosts(editor.claims, { page: 1, pageSize: 50 });
    expect(all.total).toBeGreaterThan(mine.total);
    const drafts = await studio.listPosts(editor.claims, { status: "draft", mine: false, page: 1, pageSize: 50 });
    expect(drafts.items.every((p) => p.status === "draft")).toBe(true);
  });

  it("lets writers delete only their own drafts", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Delete me" });
    await expect(studio.deletePost(writer2.claims, post.id)).rejects.toMatchObject({ kind: "not_found" });
    await studio.deletePost(writer.claims, post.id);
    expect(await studio.getPost(writer.claims, post.id)).toBeNull();
  });
});

describe("review workflow", () => {
  it("runs submit → changes requested → resubmit → approve → publish, with notes as comments", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Workflow story" });
    await studio.transition(writer.claims, post.id, { to: "in_review" });

    const queue = await studio.reviewQueue(editor.claims);
    expect(queue.map((p) => p.id)).toContain(post.id);
    expect(await studio.reviewQueue(writer.claims)).toEqual([]);

    await studio.transition(editor.claims, post.id, { to: "changes_requested", note: "Add a source for the figure." });
    const comments = await studio.listComments(writer.claims, post.id);
    expect(comments).toMatchObject([{ body: "Add a source for the figure.", author: { id: editor.id } }]);

    await studio.updatePost(writer.claims, post.id, { title: "Workflow story, sourced" });
    await studio.transition(writer.claims, post.id, { to: "in_review" });
    const approved = await studio.transition(editor.claims, post.id, { to: "approved" });
    expect(approved).toMatchObject({ status: "approved", approvedBy: { id: editor.id } });

    const published = await studio.transition(editor.claims, post.id, { to: "published" });
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
  });

  it("does not show editors their own posts in the review queue", async () => {
    const post = await studio.createPost(editor.claims, { type: "news", title: "Editor's own" });
    await studio.transition(editor.claims, post.id, { to: "in_review" });
    expect((await studio.reviewQueue(editor.claims)).map((p) => p.id)).not.toContain(post.id);
  });

  it("maps workflow refusals to domain errors", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Skip review" });
    await expect(studio.transition(writer.claims, post.id, { to: "published" })).rejects.toMatchObject({ kind: "conflict" });
    await studio.transition(writer.claims, post.id, { to: "in_review" });
    await expect(studio.transition(writer.claims, post.id, { to: "approved" })).rejects.toMatchObject({ kind: "forbidden" });
  });
});

describe("comments", () => {
  it("resolves comments without allowing text edits", async () => {
    const post = await studio.createPost(writer.claims, { type: "news", title: "Commented" });
    const c = await studio.addComment(writer.claims, post.id, { body: "Is this figure right?" });
    const resolved = await studio.setCommentResolved(writer.claims, c.id, true);
    expect(resolved.resolvedAt).not.toBeNull();
    await expect(
      t.db.asUser(writer.claims, (q) => q.query("update public.editorial_comments set body = 'x' where id = $1", [c.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("stops writers commenting on posts they can't see", async () => {
    const other = await insertPost(t.pg, { authorId: writer2.id });
    await expect(studio.addComment(writer.claims, other, { body: "hi" })).rejects.toMatchObject({ kind: "forbidden" });
  });
});

describe("scheduler", () => {
  it("publishes scheduled posts once they are due, and leaves the rest", async () => {
    const due = await insertPost(t.pg, { authorId: writer.id, status: "scheduled", approverId: editor.id });
    const later = await insertPost(t.pg, { authorId: writer.id, status: "scheduled", approverId: editor.id });
    await t.pg.query("update public.posts set scheduled_for = now() - interval '1 minute' where id = $1", [due]);

    expect(await publishDueScheduled(t.db)).toEqual([due]);
    const rows = await t.pg.query<{ id: string; status: string }>(
      "select id, status from public.posts where id = any($1::uuid[])",
      [[due, later]],
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.id, r.status]))).toEqual({ [due]: "published", [later]: "scheduled" });
    expect(await publishDueScheduled(t.db)).toEqual([]);
  });
});
