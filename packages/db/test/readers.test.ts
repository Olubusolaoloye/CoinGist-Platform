import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReaderRepository, type ReaderRepository } from "../src/readers.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let r: ReaderRepository;
let reader: TestUser, reader2: TestUser, writer: TestUser, writer2: TestUser, editor: TestUser;
let catId: string, tagId: string;

async function publish(authorId: string, title: string, opts: { category?: string; tag?: string; daysAgo?: number } = {}) {
  const id = await insertPost(t.pg, { authorId, status: "published", approverId: editor.id, title, publishedAt: new Date(Date.now() - (opts.daysAgo ?? 0) * 86_400_000 - 60_000) });
  if (opts.category) await t.pg.query("update public.posts set category_id = $2 where id = $1", [id, opts.category]);
  if (opts.tag) await t.pg.query("insert into public.post_tags (post_id, tag_id) values ($1, $2)", [id, opts.tag]);
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  r = createReaderRepository(t.db);
  reader = await t.createUser();
  reader2 = await t.createUser();
  writer = await t.createUser({ role: "writer", name: "Ama Writer" });
  writer2 = await t.createUser({ role: "writer", name: "Bayo Writer" });
  editor = await t.createUser({ role: "editor" });
  await t.pg.query("insert into public.author_profiles (user_id, slug) values ($1, 'ama-writer'), ($2, 'bayo-writer')", [writer.id, writer2.id]);
  catId = (await t.pg.query<{ id: string }>("insert into public.categories (slug, name) values ('bitcoin', 'Bitcoin') returning id")).rows[0]!.id;
  tagId = (await t.pg.query<{ id: string }>("insert into public.tags (slug, name) values ('p2p', 'P2P') returning id")).rows[0]!.id;
});
afterAll(() => t.close());

describe("bookmarks", () => {
  it("saves published stories, newest saved first, and keeps them private", async () => {
    const a = await publish(writer.id, "First story");
    const b = await publish(writer.id, "Second story");
    await r.addBookmark(reader.claims, a);
    await r.addBookmark(reader.claims, b);
    await r.addBookmark(reader.claims, b); // idempotent
    const list = await r.listBookmarks(reader.claims, { page: 1, pageSize: 10 });
    expect(list.items.map((s) => s.title)).toEqual(["Second story", "First story"]);
    expect(list.total).toBe(2);
    expect(list.items[0]!.savedAt).toBeTruthy();

    expect((await r.listBookmarks(reader2.claims, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await r.state(reader.claims, a)).bookmarked).toBe(true);
    expect((await r.state(reader2.claims, a)).bookmarked).toBe(false);

    await r.removeBookmark(reader.claims, a);
    expect((await r.state(reader.claims, a)).bookmarked).toBe(false);
  });

  it("refuses drafts and other readers' rows", async () => {
    const draft = await insertPost(t.pg, { authorId: writer.id });
    await expect(r.addBookmark(reader.claims, draft)).rejects.toMatchObject({ kind: "not_found" });
    const pub = await publish(writer.id, "Mine");
    await expect(
      t.db.asUser(reader.claims, (q) => q.query("insert into public.bookmarks (user_id, post_id) values ($1, $2)", [reader2.id, pub])),
    ).rejects.toThrow(/row-level security/);
    await expect(t.db.asUser(null, (q) => q.query("select * from public.bookmarks"))).rejects.toThrow(/permission denied/);
  });
});

describe("follows and the feed", () => {
  it("follows writers, topics and tags by slug, and builds a feed explaining why", async () => {
    const byWriter = await publish(writer.id, "By Ama", { daysAgo: 3 });
    const inTopic = await publish(writer2.id, "In Bitcoin", { category: catId, daysAgo: 2 });
    const tagged = await publish(writer2.id, "Tagged P2P", { tag: tagId, daysAgo: 1 });
    const other = await publish(writer2.id, "Unrelated", { daysAgo: 0 });

    expect((await r.feed(reader2.claims, { page: 1, pageSize: 20 })).items).toEqual([]);

    expect(await r.follow(reader2.claims, { type: "author", slug: "ama-writer" })).toEqual({ type: "author", slug: "ama-writer", name: "Ama Writer" });
    await r.follow(reader2.claims, { type: "category", slug: "bitcoin" });
    await r.follow(reader2.claims, { type: "tag", slug: "p2p" });
    await r.follow(reader2.claims, { type: "tag", slug: "p2p" }); // idempotent
    await expect(r.follow(reader2.claims, { type: "tag", slug: "nope" })).rejects.toMatchObject({ kind: "not_found" });

    expect((await r.listFollows(reader2.claims)).map((f) => `${f.type}:${f.slug}`)).toEqual(["author:ama-writer", "category:bitcoin", "tag:p2p"]);

    const feed = await r.feed(reader2.claims, { page: 1, pageSize: 20 });
    const ids = feed.items.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([tagged, inTopic, byWriter]));
    expect(ids).not.toContain(other);
    expect(ids.indexOf(tagged)).toBeLessThan(ids.indexOf(inTopic)); // newest first
    const why = Object.fromEntries(feed.items.map((s) => [s.id, s.because]));
    expect(why[byWriter]).toEqual({ type: "author", name: "Ama Writer" });
    expect(why[inTopic]).toEqual({ type: "category", name: "Bitcoin" });
    expect(why[tagged]).toEqual({ type: "tag", name: "P2P" });
    expect(feed.follows).toHaveLength(3);

    // Someone else's follows don't leak in.
    expect((await r.feed(reader.claims, { page: 1, pageSize: 20 })).items).toEqual([]);

    await r.unfollow(reader2.claims, { type: "category", slug: "bitcoin" });
    expect((await r.feed(reader2.claims, { page: 1, pageSize: 20 })).items.map((s) => s.id)).not.toContain(inTopic);
  });

  it("never shows unpublished stories, even to staff readers", async () => {
    await r.follow(editor.claims, { type: "author", slug: "ama-writer" });
    const draft = await insertPost(t.pg, { authorId: writer.id, title: "Secret draft" });
    const feed = await r.feed(editor.claims, { page: 1, pageSize: 50 });
    expect(feed.items.map((s) => s.id)).not.toContain(draft);
  });

  it("can't follow arbitrary ids", async () => {
    await expect(
      t.db.asUser(reader.claims, (q) =>
        q.query("insert into public.follows (user_id, target_type, target_id) values ($1, 'author', $2)", [reader.id, reader2.id]),
      ),
    ).rejects.toThrow(/nothing to follow/);
  });

  it("deactivating keeps everything; signing in again brings it all back", async () => {
    const x = await t.createUser();
    await r.follow(x.claims, { type: "tag", slug: "p2p" });
    await r.deactivate(x.claims);
    const row = await t.pg.query<{ status: string }>("select status from public.users where id = $1", [x.id]);
    expect(row.rows[0]!.status).toBe("deactivated");
    expect((await t.pg.query("select 1 from public.follows where user_id = $1", [x.id])).rows).toHaveLength(1); // kept
    await expect(r.deactivate(x.claims)).rejects.toMatchObject({ kind: "conflict" });
    expect(await r.reactivate(x.claims)).toBe(true);
    expect(await r.reactivate(x.claims)).toBe(false);
    expect((await r.state(x.claims, null)).follows).toHaveLength(1);
    const log = await t.pg.query<{ action: string }>("select action from public.audit_logs where entity_id = $1 order by created_at", [x.id]);
    expect(log.rows.map((l) => l.action)).toEqual(["user.deactivated", "user.reactivated"]);
  });

  it("staff can't deactivate themselves, and suspended accounts aren't reactivated by signing in", async () => {
    await expect(r.deactivate(editor.claims)).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("admin") });
    const s = await t.createUser();
    await t.pg.query("update public.users set status = 'suspended' where id = $1", [s.id]);
    expect(await r.reactivate(s.claims)).toBe(false);
    expect((await t.pg.query<{ status: string }>("select status from public.users where id = $1", [s.id])).rows[0]!.status).toBe("suspended");
  });

  it("caps follows at 100", async () => {
    const values = Array.from({ length: 100 }, (_, i) => `('cap-${i}', 'Cap ${i}')`).join(",");
    await t.pg.query(`insert into public.tags (slug, name) values ${values}`);
    const x = await t.createUser();
    for (let i = 0; i < 100; i++) await r.follow(x.claims, { type: "tag", slug: `cap-${i}` });
    await expect(r.follow(x.claims, { type: "tag", slug: "p2p" })).rejects.toThrow(/up to 100/);
  });
});
