import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiRepository, type AiRepository } from "../src/ai.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let r: AiRepository;
let writer: TestUser, writer2: TestUser, editor: TestUser, reader: TestUser;
const entry = (postId: string | null) => ({ feature: "gist" as const, postId, provider: "offline" as const, model: null, inputTokens: 10, outputTokens: 5 });

beforeAll(async () => {
  t = await createTestDb();
  r = createAiRepository(t.db);
  writer = await t.createUser({ role: "writer", name: "Writer One" });
  writer2 = await t.createUser({ role: "writer" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser({ role: "reader" });
});
afterAll(() => t.close());

describe("ai usage", () => {
  it("records usage, counts it per user, and flags the story AI-assisted without bumping updated_at", async () => {
    const post = await insertPost(t.pg, { authorId: writer.id, status: "in_review" });
    const before = await t.pg.query<{ updated_at: Date; ai_assisted: boolean }>("select updated_at, ai_assisted from public.posts where id = $1", [post]);
    expect(before.rows[0]!.ai_assisted).toBe(false);

    await r.record(writer.claims, entry(post));
    await r.record(writer.claims, { ...entry(null), feature: "outline" });
    expect(await r.countSince(writer.claims, new Date(Date.now() - 60_000))).toBe(2);
    expect(await r.countSince(writer2.claims, new Date(0))).toBe(0);

    const after = await t.pg.query<{ updated_at: Date; ai_assisted: boolean }>("select updated_at, ai_assisted from public.posts where id = $1", [post]);
    expect(after.rows[0]!.ai_assisted).toBe(true);
    expect(after.rows[0]!.updated_at.toISOString()).toBe(before.rows[0]!.updated_at.toISOString());

    // Editors see what AI touched on any story; other writers see nothing.
    expect(await r.postUsage(editor.claims, post)).toEqual([expect.objectContaining({ feature: "gist", userName: "Writer One", provider: "offline" })]);
    expect(await r.postUsage(writer2.claims, post)).toEqual([]);
  });

  it("the flag can't be cleared afterwards", async () => {
    const post = await insertPost(t.pg, { authorId: writer.id });
    await r.record(writer.claims, entry(post));
    await t.db.asUser(writer.claims, (q) => q.query("update public.posts set ai_assisted = false where id = $1", [post]));
    const row = await t.pg.query<{ ai_assisted: boolean }>("select ai_assisted from public.posts where id = $1", [post]);
    expect(row.rows[0]!.ai_assisted).toBe(true);
  });

  it("only staff can log usage, only for themselves and stories they can see", async () => {
    const theirs = await insertPost(t.pg, { authorId: writer2.id });
    await expect(r.record(reader.claims, entry(null))).rejects.toMatchObject({ kind: "forbidden" });
    await expect(r.record(writer.claims, entry(theirs))).rejects.toMatchObject({ kind: "forbidden" });
    await expect(r.record(writer.claimsNoMfa, entry(null))).rejects.toMatchObject({ kind: "forbidden" });
    await expect(
      t.db.asUser(writer.claims, (q) =>
        q.query("insert into public.ai_usage (user_id, feature, provider) values ($1, 'gist', 'offline')", [writer2.id]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.db.asUser(writer.claims, (q) => q.query("delete from public.ai_usage where user_id = $1", [writer.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(r.assertCanUsePost(writer.claims, theirs)).rejects.toMatchObject({ kind: "not_found" });
    await expect(r.assertCanUsePost(editor.claims, theirs)).resolves.toBeUndefined();
  });
});

describe("internal links", () => {
  it("suggests related published stories, never the story itself or unpublished ones", async () => {
    const mk = async (title: string, status: "published" | "draft" = "published") =>
      insertPost(t.pg, { authorId: writer.id, status, approverId: editor.id, title });
    const me = await mk("Stablecoin remittances grow in Nigeria", "draft");
    const related = await mk("How stablecoin transfers cut remittance fees");
    await mk("Nigeria's naira and stablecoins", "draft");
    await mk("Ethereum gas fees explained");
    const links = await r.internalLinks(writer.claims, me);
    expect(links.map((l) => l.id)).toContain(related);
    expect(links.map((l) => l.id)).not.toContain(me);
    expect(links.every((l) => l.path.startsWith("/news/"))).toBe(true);
    expect(links.map((l) => l.title)).not.toContain("Ethereum gas fees explained");
  });
});
