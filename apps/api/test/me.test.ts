import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertPost } from "@coingist/db/testing";
import type { App } from "../src/app.js";
import { bearer, setup, tokenFor, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let reader: TestUser, other: TestUser, writer: TestUser, editor: TestUser;
let postId: string;

beforeAll(async () => {
  ({ t, app } = await setup());
  reader = await t.createUser();
  other = await t.createUser();
  writer = await t.createUser({ role: "writer", name: "Ama Writer" });
  editor = await t.createUser({ role: "editor" });
  await t.pg.query("insert into public.author_profiles (user_id, slug) values ($1, 'ama-writer')", [writer.id]);
  postId = await insertPost(t.pg, { authorId: writer.id, status: "published", approverId: editor.id, title: "Hello readers" });
});
afterAll(() => t.close());

const call = async (method: string, path: string, who: TestUser | null, body?: unknown, aal: "aal1" | "aal2" = "aal1") =>
  app.request(`/v1/me${path}`, {
    method,
    headers: { ...(who ? bearer(await tokenFor(who, { aal })) : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe("reader account API", () => {
  it("needs a signed-in, active account (no 2FA needed) and is never cached", async () => {
    expect((await call("GET", "/feed", null)).status).toBe(401);
    const res = await call("GET", "/feed", reader);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const suspended = await t.createUser();
    await t.pg.query("update public.users set status = 'suspended' where id = $1", [suspended.id]);
    expect((await call("GET", "/bookmarks", suspended)).status).toBe(403);
  });

  it("saves and unsaves a story", async () => {
    expect((await call("PUT", `/bookmarks/${postId}`, reader)).status).toBe(204);
    expect(await (await call("GET", `/state?postId=${postId}`, reader)).json()).toMatchObject({ bookmarked: true });
    expect(await (await call("GET", `/state?postId=${postId}`, other)).json()).toMatchObject({ bookmarked: false });
    const list = (await (await call("GET", "/bookmarks", reader)).json()) as { items: Array<{ title: string }>; total: number };
    expect(list.items.map((i) => i.title)).toEqual(["Hello readers"]);
    expect((await call("DELETE", `/bookmarks/${postId}`, reader)).status).toBe(204);
    expect((await call("PUT", "/bookmarks/not-a-uuid", reader)).status).toBe(400);
    const draft = await insertPost(t.pg, { authorId: writer.id });
    expect((await call("PUT", `/bookmarks/${draft}`, reader)).status).toBe(404);
  });

  it("follows and unfollows, and the feed follows along", async () => {
    const res = await call("PUT", "/follows", reader, { type: "author", slug: "ama-writer" });
    expect(await res.json()).toEqual({ follow: { type: "author", slug: "ama-writer", name: "Ama Writer" } });
    expect((await call("PUT", "/follows", reader, { type: "author", slug: "Bad Slug!" })).status).toBe(400);
    expect((await call("PUT", "/follows", reader, { type: "planet", slug: "mars" })).status).toBe(400);
    expect((await call("PUT", "/follows", reader, { type: "tag", slug: "missing" })).status).toBe(404);

    const feed = (await (await call("GET", "/feed", reader)).json()) as { items: Array<{ title: string; because: unknown }> };
    expect(feed.items).toEqual([expect.objectContaining({ title: "Hello readers", because: { type: "author", name: "Ama Writer" } })]);

    expect((await call("DELETE", "/follows/author/ama-writer", reader)).status).toBe(204);
    expect(await (await call("GET", "/follows", reader)).json()).toEqual({ follows: [] });
  });

  it("clears all reading data", async () => {
    await call("PUT", `/bookmarks/${postId}`, reader);
    await call("PUT", "/follows", reader, { type: "author", slug: "ama-writer" });
    expect((await call("DELETE", "/data", reader)).status).toBe(204);
    expect(await (await call("GET", "/state", reader)).json()).toEqual({ bookmarked: false, follows: [] });
  });
});
