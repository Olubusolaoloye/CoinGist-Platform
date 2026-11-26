import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthorsRepository, type AuthorsRepository } from "../src/authors.js";
import { createContentRepository } from "../src/content.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let a: AuthorsRepository;
let writer: TestUser, other: TestUser, editor: TestUser, reader: TestUser;

const profile = (name: string, extra: Record<string, unknown> = {}) => ({
  name, avatarUrl: "", title: "", bio: "", socials: {}, expertise: [], ...extra,
});

beforeAll(async () => {
  t = await createTestDb();
  a = createAuthorsRepository(t.db);
  writer = await t.createUser({ role: "writer", name: "Ada Obi" });
  other = await t.createUser({ role: "writer", name: "Other Writer" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser();
});
afterAll(() => t.close());

describe("author profiles", () => {
  it("lets a writer create their profile, which shows on the public author page", async () => {
    const slug = await a.saveProfile(writer.claims, writer.id, profile("Ada Obi", {
      title: "Markets reporter", bio: "Covers exchanges.", socials: { x: "https://x.com/ada", linkedin: "" }, expertise: ["Bitcoin"],
    }));
    expect(slug).toBe("ada-obi");
    const pub = await createContentRepository(t.db).getAuthor(slug);
    expect(pub).toMatchObject({ name: "Ada Obi", title: "Markets reporter", bio: "Covers exchanges.", socials: { x: "https://x.com/ada" }, expertise: ["Bitcoin"] });
  });

  it("keeps the slug when the name changes, and makes new slugs unique", async () => {
    expect(await a.saveProfile(writer.claims, writer.id, profile("Ada N. Obi"))).toBe("ada-obi");
    expect(await a.saveProfile(other.claims, other.id, profile("Ada Obi"))).toBe("ada-obi-2");
  });

  it("writers edit only themselves; editors edit anyone on staff (audit-logged), never readers", async () => {
    await expect(a.saveProfile(writer.claims, other.id, profile("Hacked"))).rejects.toMatchObject({ kind: "forbidden" });
    await a.saveProfile(editor.claims, other.id, profile("Tolu Ade", { title: "Regulation reporter" }));
    const list = await a.list(editor.claims);
    expect(list.find((x) => x.id === other.id)).toMatchObject({ name: "Tolu Ade", title: "Regulation reporter" });
    expect(list.some((x) => x.id === reader.id)).toBe(false);
    const log = await t.pg.query<{ entity_id: string }>("select entity_id from public.audit_logs where action = 'author.updated'");
    expect(log.rows.map((r) => r.entity_id)).toContain(other.id);
    await expect(a.saveProfile(editor.claims, reader.id, profile("Reader"))).rejects.toMatchObject({ kind: "conflict" });
    expect((await a.list(writer.claims)).map((x) => x.id)).toEqual([writer.id]);
  });

  it("rejects an empty name and non-https photos", async () => {
    await expect(a.saveProfile(writer.claims, writer.id, profile("  "))).rejects.toMatchObject({ kind: "invalid" });
    await expect(a.saveProfile(writer.claims, writer.id, profile("Ada", { avatarUrl: "javascript:alert(1)" }))).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("story bylines", () => {
  it("editors credit a story to another staff member, audit-logged", async () => {
    const post = await insertPost(t.pg, { authorId: writer.id });
    await a.setPostAuthor(editor.claims, post, other.id);
    const row = await t.pg.query<{ author_id: string }>("select author_id from public.posts where id = $1", [post]);
    expect(row.rows[0]!.author_id).toBe(other.id);
    const log = await t.pg.query<{ metadata: { from: string; to: string } }>("select metadata from public.audit_logs where action = 'post.author_changed'");
    expect(log.rows[0]!.metadata).toEqual({ from: writer.id, to: other.id });
  });

  it("writers can't change bylines; readers can't be credited", async () => {
    const post = await insertPost(t.pg, { authorId: writer.id });
    await expect(a.setPostAuthor(writer.claims, post, other.id)).rejects.toMatchObject({ kind: "forbidden" });
    await expect(a.setPostAuthor(editor.claims, post, reader.id)).rejects.toMatchObject({ kind: "conflict" });
  });
});
