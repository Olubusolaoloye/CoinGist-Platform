import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let reader: TestUser, writerA: TestUser, writerB: TestUser, editor: TestUser, admin: TestUser;
let published: string, futurePublished: string, draftA: string, draftB: string;

beforeAll(async () => {
  t = await createTestDb();
  reader = await t.createUser();
  writerA = await t.createUser({ role: "writer" });
  writerB = await t.createUser({ role: "writer" });
  editor = await t.createUser({ role: "editor" });
  admin = await t.createUser({ role: "admin" });
  published = await insertPost(t.pg, {
    authorId: writerA.id,
    status: "published",
    approverId: editor.id,
  });
  futurePublished = await insertPost(t.pg, {
    authorId: writerA.id,
    status: "published",
    approverId: editor.id,
    publishedAt: new Date(Date.now() + 3_600_000),
  });
  draftA = await insertPost(t.pg, { authorId: writerA.id });
  draftB = await insertPost(t.pg, { authorId: writerB.id });
});
afterAll(() => t.close());

const visiblePosts = (claims: TestUser["claims"] | null) =>
  t.db.asUser(claims, async (q) =>
    (await q.query<{ id: string }>("select id from public.posts")).map((r) => r.id).sort(),
  );

describe("posts visibility", () => {
  it("shows anonymous visitors only posts that are published and live", async () => {
    expect(await visiblePosts(null)).toEqual([published]);
  });

  it("shows readers only published posts", async () => {
    expect(await visiblePosts(reader.claims)).toEqual([published]);
  });

  it("shows writers published posts plus their own drafts, not other writers' drafts", async () => {
    const ids = await visiblePosts(writerA.claims);
    expect(ids).toEqual([published, futurePublished, draftA].sort());
    expect(ids).not.toContain(draftB);
  });

  it("shows editors and admins every post", async () => {
    const all = [published, futurePublished, draftA, draftB].sort();
    expect(await visiblePosts(editor.claims)).toEqual(all);
    expect(await visiblePosts(admin.claims)).toEqual(all);
  });

  it("gives staff no extra access until they pass 2FA", async () => {
    expect(await visiblePosts(writerA.claimsNoMfa)).toEqual([published]);
    expect(await visiblePosts(admin.claimsNoMfa)).toEqual([published]);
  });
});

describe("posts writes", () => {
  const insertAs = (claims: TestUser["claims"] | null, authorId: string, slug: string) =>
    t.db.asUser(claims, (q) =>
      q.query(
        "insert into public.posts (type, title, slug, author_id) values ('news', 'T', $1, $2)",
        [slug, authorId],
      ),
    );

  it("lets a writer with 2FA create a draft as themselves", async () => {
    await expect(insertAs(writerA.claims, writerA.id, "writer-new-draft")).resolves.toBeDefined();
  });

  it("blocks readers, writers without 2FA, and writers posing as someone else", async () => {
    await expect(insertAs(reader.claims, reader.id, "reader-post")).rejects.toThrow(/row-level/);
    await expect(insertAs(writerA.claimsNoMfa, writerA.id, "nomfa-post")).rejects.toThrow(
      /row-level/,
    );
    await expect(insertAs(writerA.claims, writerB.id, "impersonate")).rejects.toThrow(/row-level/);
  });

  it("never lets clients set status or approval columns directly", async () => {
    for (const actor of [writerA, editor, admin]) {
      await expect(
        t.db.asUser(actor.claims, (q) =>
          q.query("update public.posts set status = 'published' where id = $1", [draftA]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        t.db.asUser(actor.claims, (q) =>
          q.query(
            `insert into public.posts (type, title, slug, author_id, status)
             values ('news', 'x', $1, $2, 'published')`,
            [`direct-${actor.role}`, actor.id],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("lets writers edit their own drafts but not other writers' drafts or approved posts", async () => {
    const update = (claims: TestUser["claims"], id: string) =>
      t.db.asUser(claims, (q) =>
        q.query<{ id: string }>("update public.posts set title = 'Edited' where id = $1 returning id", [
          id,
        ]),
      );
    expect(await update(writerA.claims, draftA)).toHaveLength(1);
    expect(await update(writerA.claims, draftB)).toHaveLength(0);
    expect(await update(writerA.claims, published)).toHaveLength(0);
    expect(await update(editor.claims, draftB)).toHaveLength(1);
  });

  it("records a revision whenever content changes", async () => {
    const res = await t.pg.query<{ title: string }>(
      "select title from public.post_revisions where post_id = $1",
      [draftA],
    );
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("keeps ai_assisted set once a post has used AI", async () => {
    await t.db.asUser(writerA.claims, (q) =>
      q.query("update public.posts set ai_assisted = true where id = $1", [draftA]),
    );
    await t.db.asUser(writerA.claims, (q) =>
      q.query("update public.posts set ai_assisted = false where id = $1", [draftA]),
    );
    const res = await t.pg.query<{ a: boolean }>(
      "select ai_assisted a from public.posts where id = $1",
      [draftA],
    );
    expect(res.rows[0]!.a).toBe(true);
  });
});

describe("users table", () => {
  it("lets users rename themselves but not change their own role", async () => {
    await t.db.asUser(reader.claims, (q) =>
      q.query("update public.users set name = 'New Name' where id = $1", [reader.id]),
    );
    await expect(
      t.db.asUser(reader.claims, (q) =>
        q.query("update public.users set role = 'admin' where id = $1", [reader.id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("hides other users' rows from readers and anon", async () => {
    const rows = await t.db.asUser(reader.claims, (q) => q.query("select id from public.users"));
    expect(rows).toEqual([{ id: reader.id }]);
    // Signed out: no access to the table at all (not even an empty result).
    await expect(t.db.asUser(null, (q) => q.query("select id from public.users"))).rejects.toThrow(/permission denied/);
  });

  it("exposes bylines through author_directory without emails", async () => {
    await t.pg.query("insert into public.author_profiles (user_id, slug) values ($1, 'writer-a')", [
      writerA.id,
    ]);
    const rows = await t.db.asUser(null, (q) =>
      q.query<Record<string, unknown>>("select * from public.author_directory"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "writer-a" });
    expect(rows[0]).not.toHaveProperty("email");
  });
});

describe("restricted tables", () => {
  it("only admins read audit logs and subscribers", async () => {
    await t.pg.query("insert into public.subscribers (email) values ('sub@example.com')");
    await t.pg.query("insert into public.audit_logs (action, entity) values ('seed', 'test')");
    for (const table of ["audit_logs", "subscribers"]) {
      for (const actor of [reader, writerA, editor]) {
        const rows = await t.db.asUser(actor.claims, (q) => q.query(`select 1 from public.${table}`));
        expect(rows, `${actor.role} on ${table}`).toEqual([]);
      }
      const rows = await t.db.asUser(admin.claims, (q) => q.query(`select 1 from public.${table}`));
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it("blocks clients from writing audit logs directly", async () => {
    await expect(
      t.db.asUser(admin.claims, (q) =>
        q.query("insert into public.audit_logs (action, entity) values ('fake', 'x')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps bookmarks private to their owner", async () => {
    await t.db.asUser(reader.claims, (q) =>
      q.query("insert into public.bookmarks (user_id, post_id) values ($1, $2)", [
        reader.id,
        published,
      ]),
    );
    await expect(
      t.db.asUser(writerA.claims, (q) =>
        q.query("insert into public.bookmarks (user_id, post_id) values ($1, $2)", [
          reader.id,
          published,
        ]),
      ),
    ).rejects.toThrow(/row-level/);
    expect(
      await t.db.asUser(writerA.claims, (q) => q.query("select 1 from public.bookmarks")),
    ).toEqual([]);
  });

  it("lets editors manage sponsors and writers not", async () => {
    await expect(
      t.db.asUser(writerA.claims, (q) =>
        q.query("insert into public.sponsors (name) values ('Acme')"),
      ),
    ).rejects.toThrow(/row-level/);
    await expect(
      t.db.asUser(editor.claims, (q) =>
        q.query("insert into public.sponsors (name) values ('Acme')"),
      ),
    ).resolves.toBeDefined();
  });

  it("shows writers only their own payments", async () => {
    await t.pg.query(
      "insert into public.writer_payments (writer_id, amount) values ($1, 50), ($2, 75)",
      [writerA.id, writerB.id],
    );
    const rows = await t.db.asUser(writerA.claims, (q) =>
      q.query<{ writer_id: string }>("select writer_id from public.writer_payments"),
    );
    expect(rows).toEqual([{ writer_id: writerA.id }]);
  });
});
