import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { bearer, setup, tokenFor, WEBHOOK_SECRET, type fakeNewsletter, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let nl: ReturnType<typeof fakeNewsletter>;
let admin: TestUser, editor: TestUser;

beforeAll(async () => {
  ({ t, app, newsletter: nl } = await setup());
  admin = await t.createUser({ role: "admin" });
  editor = await t.createUser({ role: "editor" });
});
afterAll(() => t.close());

const subscribe = (body: unknown) =>
  app.request("/v1/public/newsletter/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const signed = (body: string, id = `msg_${Math.random()}`) => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", Buffer.from(WEBHOOK_SECRET.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}`, "content-type": "application/json" };
};

describe("POST /v1/public/newsletter/subscribe", () => {
  it("records the signup, syncs it, and answers generically without caching", async () => {
    const res = await subscribe({ email: " Kemi@Example.com ", lists: ["daily-gist"], source: "footer" });
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, message: "Check your inbox to confirm your subscription." });
    expect(nl.calls.at(-1)).toMatchObject({ email: "kemi@example.com", lists: ["daily-gist"], source: "footer", reactivate: true });
    const row = await t.pg.query("select status, sync_status, external_id from public.subscribers where email = 'kemi@example.com'");
    expect(row.rows[0]).toEqual({ status: "pending", sync_status: "synced", external_id: "ext_kemi@example.com" });
  });

  it("gives the same answer for an existing subscriber and doesn't re-send", async () => {
    const before = nl.calls.length;
    const res = await subscribe({ email: "kemi@example.com", lists: ["daily-gist"], source: "article" });
    expect(await res.json()).toEqual({ ok: true, message: "Check your inbox to confirm your subscription." });
    expect(nl.calls.length).toBe(before);
  });

  it("silently drops honeypot submissions", async () => {
    const before = nl.calls.length;
    expect((await subscribe({ email: "bot@example.com", website: "http://spam.test" })).status).toBe(202);
    expect(nl.calls.length).toBe(before);
    const row = await t.pg.query("select 1 from public.subscribers where email = 'bot@example.com'");
    expect(row.rows).toEqual([]);
  });

  it("still succeeds for the reader when the newsletter tool is down, and records the failure", async () => {
    expect((await subscribe({ email: "ade+fail@example.com" })).status).toBe(202);
    const row = await t.pg.query<{ sync_status: string; sync_error: string }>(
      "select sync_status, sync_error from public.subscribers where email = 'ade+fail@example.com'",
    );
    expect(row.rows[0]).toEqual({ sync_status: "failed", sync_error: "fake outage" });
  });

  it("validates input with readable messages", async () => {
    const bad = async (body: unknown) => ((await (await subscribe(body)).json()) as { error: { message: string } }).error.message;
    expect(await bad({ email: "not-an-email" })).toBe("Enter a valid email address.");
    expect(await bad({ email: "a@b.co", lists: [] })).toBe("Choose at least one newsletter.");
    expect((await subscribe({ email: "a@b.co", lists: ["spam"] })).status).toBe(400);
    expect((await subscribe({ email: "a@b.co", admin: true })).status).toBe(400);
  });

  it("stores unknown sources as 'other'", async () => {
    await subscribe({ email: "src@example.com", source: "<script>" });
    const row = await t.pg.query("select source from public.subscribers where email = 'src@example.com'");
    expect(row.rows[0]).toEqual({ source: "other" });
  });
});

describe("POST /v1/webhooks/newsletter", () => {
  it("applies signed status changes", async () => {
    const body = JSON.stringify({ event_type: "subscription.confirmed", data: { id: "ext_kemi@example.com", email: "kemi@example.com" } });
    const res = await app.request("/v1/webhooks/newsletter", { method: "POST", headers: signed(body), body });
    expect(res.status).toBe(204);
    const row = await t.pg.query("select status from public.subscribers where email = 'kemi@example.com'");
    expect(row.rows[0]).toEqual({ status: "active" });
  });

  it("rejects unsigned or tampered requests", async () => {
    const body = JSON.stringify({ event_type: "subscription.deleted", data: { email: "kemi@example.com" } });
    const headers = signed(body);
    expect((await app.request("/v1/webhooks/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(401);
    const tampered = body.replace("kemi", "ade");
    expect((await app.request("/v1/webhooks/newsletter", { method: "POST", headers, body: tampered })).status).toBe(401);
    const row = await t.pg.query("select status from public.subscribers where email = 'kemi@example.com'");
    expect(row.rows[0]).toEqual({ status: "active" });
  });

  it("acknowledges events it doesn't act on", async () => {
    const body = JSON.stringify({ event_type: "post.sent", data: { id: "post_1" } });
    expect((await app.request("/v1/webhooks/newsletter", { method: "POST", headers: signed(body), body })).status).toBe(204);
  });
});

describe("admin subscriber routes", () => {
  const get = async (path: string, user: TestUser) => app.request(path, { headers: bearer(await tokenFor(user)) });

  it("are admin-only", async () => {
    expect((await app.request("/v1/admin/subscribers")).status).toBe(401);
    expect((await get("/v1/admin/subscribers", editor)).status).toBe(403);
    const res = await get("/v1/admin/subscribers?sync=failed", admin);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: Array<{ email: string }> }).items.map((s) => s.email)).toEqual(["ade+fail@example.com"]);
  });

  it("report stats and retry failed syncs", async () => {
    const stats = (await (await get("/v1/admin/subscribers/stats", admin)).json()) as { stats: { failedSyncs: number; byStatus: { active: number } }; provider: string };
    expect(stats).toMatchObject({ provider: "fake", stats: { failedSyncs: 1, byStatus: { active: 1 } } });
    const retry = await app.request("/v1/admin/subscribers/retry-failed", { method: "POST", headers: bearer(await tokenFor(admin)) });
    // "+fail" addresses keep failing in the fake provider.
    expect(await retry.json()).toMatchObject({ requeued: 1, attempted: 1, synced: 0 });
  });
});
