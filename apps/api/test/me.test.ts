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

  it("deactivates an account (keeping its data) and reactivates it on the next sign-in", async () => {
    const leaver = await t.createUser();
    await call("PUT", `/bookmarks/${postId}`, leaver);
    expect((await call("POST", "/deactivate", leaver)).status).toBe(204);
    expect((await call("GET", "/state", leaver)).status).toBe(403); // locked out while deactivated
    expect((await call("POST", "/deactivate", writer)).status).toBe(409); // staff: an admin manages it
    const back = await call("POST", "/reactivate", leaver);
    expect(await back.json()).toEqual({ reactivated: true });
    expect(await (await call("GET", `/state?postId=${postId}`, leaver)).json()).toMatchObject({ bookmarked: true });
    expect(await (await call("POST", "/reactivate", leaver)).json()).toEqual({ reactivated: false });
    expect((await call("POST", "/reactivate", null)).status).toBe(401);
  });
});

describe("comments and likes over HTTP", () => {
  const engagement = async () => (await (await app.request(`/v1/public/posts/${postId}/engagement`)).json()) as {
    likes: number;
    comments: Array<{ id: string; body: string; parentId: string | null; likes: number; author: { name: string } | null }>;
  };

  it("anyone reads the thread (never cached); signed-in readers comment, reply, like and set their name", async () => {
    const pub = await app.request(`/v1/public/posts/${postId}/engagement`);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("cache-control")).toBe("no-store");
    expect(pub.headers.get("netlify-cdn-cache-control")).toBeNull();

    expect((await call("PATCH", "/profile", reader, { name: "Kofi" })).status).toBe(204);
    const made = await call("POST", `/posts/${postId}/comments`, reader, { body: "Useful, thanks" });
    expect(made.status).toBe(201);
    const { id } = (await made.json()) as { id: string };
    expect((await call("POST", `/posts/${postId}/comments`, other, { body: "Same here", parentId: id })).status).toBe(201);
    expect(await (await call("PUT", `/posts/${postId}/like`, other)).json()).toEqual({ likes: 1 });
    expect(await (await call("PUT", `/comments/${id}/like`, other)).json()).toEqual({ likes: 1 });

    const thread = await engagement();
    expect(thread.likes).toBe(1);
    expect(thread.comments.map((c) => [c.author?.name, c.body, c.parentId])).toEqual([
      ["Kofi", "Useful, thanks", null],
      [expect.any(String), "Same here", id],
    ]);
    expect(await (await call("GET", `/posts/${postId}/engagement`, other)).json()).toEqual({ likedPost: true, likedCommentIds: [id] });

    expect((await call("PATCH", `/comments/${id}`, reader, { body: "Useful, thank you" })).status).toBe(204);
    expect((await call("PATCH", `/comments/${id}`, other, { body: "hijack" })).status).toBe(404);
    expect((await call("POST", `/comments/${id}/report`, other, { reason: "test" })).status).toBe(204);
  });

  it("needs sign-in to write, and validates input", async () => {
    expect((await call("POST", `/posts/${postId}/comments`, null, { body: "hi" })).status).toBe(401);
    expect((await call("PUT", `/posts/${postId}/like`, null)).status).toBe(401);
    expect((await call("POST", `/posts/${postId}/comments`, reader, { body: "" })).status).toBe(400);
    expect((await call("POST", `/posts/${postId}/comments`, reader, { body: "x".repeat(2001) })).status).toBe(400);
    expect((await call("PATCH", "/profile", reader, { name: "" })).status).toBe(400);
  });

  it("editors moderate in Studio; readers and writers can't", async () => {
    const studio = async (method: string, path: string, who: TestUser, body?: unknown) =>
      app.request(`/v1/studio${path}`, {
        method,
        headers: { ...bearer(await tokenFor(who, { aal: "aal2" })), ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const list = await studio("GET", "/reader-comments?filter=reported", editor);
    expect(list.status).toBe(200);
    const { comments } = (await list.json()) as { comments: Array<{ id: string; reports: number }> };
    const reported = comments[0]!;
    expect(reported.reports).toBe(1);
    expect((await studio("PATCH", `/reader-comments/${reported.id}`, writer, { hidden: true })).status).toBe(403);
    expect((await studio("PATCH", `/reader-comments/${reported.id}`, editor, { hidden: true })).status).toBe(204);
    expect((await engagement()).comments.find((c) => c.id === reported.id)?.body ?? "").toBe(""); // hidden (placeholder: it has a reply)
    expect((await studio("DELETE", `/reader-comments/${reported.id}`, editor)).status).toBe(204);
  });
});
