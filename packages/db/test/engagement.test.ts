import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommerceRepository } from "../src/commerce.js";
import { createEngagementRepository, type EngagementRepository } from "../src/engagement.js";
import { createReaderRepository } from "../src/readers.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let e: EngagementRepository;
let ada: TestUser, ben: TestUser, cy: TestUser, dee: TestUser, writer: TestUser, editor: TestUser;
let post: string, draft: string;

beforeAll(async () => {
  t = await createTestDb();
  e = createEngagementRepository(t.db);
  ada = await t.createUser({ name: "Ada" });
  ben = await t.createUser({ name: "Ben" });
  cy = await t.createUser({ name: "Cy" });
  dee = await t.createUser({ name: "" });
  writer = await t.createUser({ role: "writer", name: "Wale Writer" });
  editor = await t.createUser({ role: "editor" });
  post = await insertPost(t.pg, { authorId: writer.id, status: "published", approverId: editor.id });
  draft = await insertPost(t.pg, { authorId: writer.id });
});
afterAll(() => t.close());

describe("comments", () => {
  it("readers comment and reply; everyone sees the thread with names, staff badges and likes", async () => {
    const top = await e.addComment(ada.claims, post, "  Great explainer.  ");
    const reply = await e.addComment(writer.claims, post, "Thanks, Ada!", top);
    // Replying to a reply joins the same thread (one level deep).
    const nested = await e.addComment(ben.claims, post, "Agreed", reply);
    expect(await e.likeComment(ben.claims, top, true)).toBe(1);
    expect(await e.likeComment(ben.claims, top, true)).toBe(1); // liking twice counts once

    const { comments } = await e.story(post);
    expect(comments.map((c) => [c.body, c.parentId])).toEqual([
      ["Great explainer.", null],
      ["Thanks, Ada!", top],
      ["Agreed", top],
    ]);
    expect(comments[0]).toMatchObject({ author: { name: "Ada", isStaff: false }, likes: 1, edited: false });
    expect(comments[1]!.author).toMatchObject({ name: "Wale Writer", isStaff: true });
    expect(nested).toBeTruthy();
    expect((await e.mine(ben.claims, post)).likedCommentIds).toEqual([top]);
  });

  it("shows 'Reader' for people without a name until they set one", async () => {
    await e.addComment(dee.claims, post, "First time here");
    expect((await e.story(post)).comments[0]!.author?.name).toBe("Reader");
    await e.setDisplayName(dee.claims, "Dee O.");
    expect((await e.story(post)).comments[0]!.author?.name).toBe("Dee O.");
  });

  it("lets people edit and delete only their own; deleted comments with replies leave a placeholder", async () => {
    const id = await e.addComment(cy.claims, post, "Typo heer");
    await expect(e.editComment(ada.claims, id, "hijack")).rejects.toMatchObject({ kind: "not_found" });
    await e.editComment(cy.claims, id, "Typo here");
    expect((await e.story(post)).comments.find((c) => c.id === id)).toMatchObject({ body: "Typo here", edited: true });

    await e.addComment(ada.claims, post, "Reply to Cy", id);
    await expect(e.deleteComment(ada.claims, id)).rejects.toMatchObject({ kind: "not_found" });
    await e.deleteComment(cy.claims, id);
    const gone = (await e.story(post)).comments.find((c) => c.id === id)!;
    expect(gone).toMatchObject({ removed: true, body: "", author: null });
  });

  it("refuses unpublished stories, empty or huge comments, blocked domains, signed-out callers and suspended accounts", async () => {
    await expect(e.addComment(ada.claims, draft, "hi")).rejects.toMatchObject({ kind: "not_found" });
    expect((await e.story(draft)).comments).toEqual([]);
    await expect(e.addComment(ada.claims, post, "   ")).rejects.toMatchObject({ kind: "invalid" });
    await expect(e.addComment(ada.claims, post, "x".repeat(2001))).rejects.toMatchObject({ kind: "invalid" });
    await createCommerceRepository(t.db).blockDomain(editor.claims, { domain: "free-airdrop.example", reason: "Scam" });
    await expect(e.addComment(ada.claims, post, "Claim at www.claim.FREE-AIRDROP.example/now")).rejects.toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("free-airdrop.example"),
    });
    await expect(t.db.asUser(null, (q) => q.query("select public.comment_add($1, 'hi')", [post]))).rejects.toThrow();
    await t.pg.query("update public.users set status = 'suspended' where id = $1", [cy.id]);
    await expect(e.addComment(cy.claims, post, "still here?")).rejects.toMatchObject({ kind: "forbidden" });
    await t.pg.query("update public.users set status = 'active' where id = $1", [cy.id]);
  });

  it("slows down rapid-fire commenting", async () => {
    const other = await insertPost(t.pg, { authorId: writer.id, status: "published", approverId: editor.id });
    const fast = await t.createUser({ name: "Fast" });
    for (let i = 0; i < 5; i++) await e.addComment(fast.claims, other, `msg ${i}`);
    await expect(e.addComment(fast.claims, other, "one more")).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("very fast") });
  });

  it("never exposes the tables directly", async () => {
    await expect(t.db.asUser(ada.claims, (q) => q.query("select * from public.comments"))).rejects.toThrow(/permission denied/);
    await expect(t.db.asUser(null, (q) => q.query("select * from public.post_likes"))).rejects.toThrow(/permission denied/);
  });
});

describe("likes", () => {
  it("counts each reader's story like once, and unlikes", async () => {
    expect(await e.likePost(ada.claims, post, true)).toBe(1);
    expect(await e.likePost(ben.claims, post, true)).toBe(2);
    expect(await e.likePost(ben.claims, post, true)).toBe(2);
    expect(await e.likePost(ben.claims, post, false)).toBe(1);
    expect((await e.story(post)).likes).toBe(1);
    expect((await e.mine(ada.claims, post)).likedPost).toBe(true);
    await expect(e.likePost(ada.claims, draft, true)).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("reports and moderation", () => {
  it("hides a comment after three reports; editors see it, restore it, or hide it themselves", async () => {
    const spam = await e.addComment(dee.claims, post, "Buy my course");
    await expect(e.report(dee.claims, spam, "")).rejects.toMatchObject({ kind: "conflict" }); // not your own
    await e.report(ada.claims, spam, "Spam");
    await e.report(ada.claims, spam, "Spam again"); // one report per person
    await e.report(ben.claims, spam, "");
    expect((await e.story(post)).comments.some((c) => c.id === spam)).toBe(true);
    await e.report(cy.claims, spam, "Advert");
    expect((await e.story(post)).comments.some((c) => c.id === spam)).toBe(false);

    const reported = await e.moderation(editor.claims, "reported");
    expect(reported[0]).toMatchObject({ id: spam, status: "hidden", hiddenByReports: true, reports: 3, reportReasons: ["Spam", "Advert"] });
    await expect(e.moderation(writer.claims, "all")).rejects.toMatchObject({ kind: "forbidden" });
    await expect(e.setHidden(ada.claims, spam, false)).rejects.toMatchObject({ kind: "forbidden" });

    await e.setHidden(editor.claims, spam, false);
    expect((await e.story(post)).comments.some((c) => c.id === spam)).toBe(true);
    expect((await e.moderation(editor.claims, "reported")).some((c) => c.id === spam)).toBe(false); // reports cleared
    await e.setHidden(editor.claims, spam, true);
    expect((await e.moderation(editor.claims, "hidden")).map((c) => c.id)).toContain(spam);
    await e.deleteComment(editor.claims, spam); // editors can delete anyone's
    const log = await t.pg.query<{ action: string }>("select action from public.audit_logs where entity = 'comments' order by created_at");
    expect(log.rows.map((r) => r.action)).toEqual(["comment.restored", "comment.hidden", "comment.deleted"]);
  });

  it("a deactivated reader's comments are hidden, kept, and come back when they return", async () => {
    const readers = createReaderRepository(t.db);
    const mine = () => e.story(post).then((s) => s.comments.filter((c) => c.author?.id === ada.id));
    const before = (await mine()).length;
    expect(before).toBeGreaterThan(0);
    await readers.deactivate(ada.claims);
    expect(await mine()).toHaveLength(0);
    expect((await t.pg.query("select 1 from public.comments where user_id = $1", [ada.id])).rows.length).toBeGreaterThan(0); // still stored
    await expect(e.addComment(ada.claims, post, "still here?")).rejects.toMatchObject({ kind: "forbidden" });
    await readers.reactivate(ada.claims);
    expect(await mine()).toHaveLength(before);
  });
});
