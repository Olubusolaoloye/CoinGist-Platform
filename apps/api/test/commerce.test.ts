import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDevData } from "@coingist/db/dev-seed";
import type { Role } from "@coingist/types";
import type { App } from "../src/app.js";
import { bearer, setup, tokenFor, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let users: Record<Role, TestUser>;

beforeAll(async () => {
  ({ t, app } = await setup());
  await seedDevData(t.pg);
  users = {
    reader: await t.createUser(),
    writer: await t.createUser({ role: "writer" }),
    editor: await t.createUser({ role: "editor" }),
    admin: await t.createUser({ role: "admin" }),
  };
});
afterAll(() => t.close());

async function call(method: string, path: string, user: TestUser | null, body?: unknown) {
  const headers: Record<string, string> = user ? bearer(await tokenFor(user)) : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

describe("access", () => {
  it.each([
    ["/v1/studio/sponsors", { anon: 401, reader: 403, writer: 403, editor: 200 }],
    ["/v1/studio/orders", { anon: 401, reader: 403, writer: 403, editor: 200 }],
    ["/v1/studio/ads/bookings", { anon: 401, reader: 403, writer: 403, editor: 200 }],
    ["/v1/studio/blocked-domains", { anon: 401, reader: 403, writer: 200, editor: 200 }],
  ] as const)("GET %s", async (path, expected) => {
    for (const [who, status] of Object.entries(expected)) {
      const res = await call("GET", path, who === "anon" ? null : users[who as Role]);
      expect(res.status, `${who} ${path}`).toBe(status);
      if (status === 200) expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("lets writers see the blocklist but not change it", async () => {
    expect((await call("POST", "/v1/studio/blocked-domains", users.writer, { domain: "x.example", reason: "y" })).status).toBe(403);
    const res = await call("POST", "/v1/studio/blocked-domains", users.editor, { domain: "https://www.Phish.example/login", reason: "Phishing" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ domain: { domain: "phish.example" } });
  });
});

describe("orders over HTTP", () => {
  it("refuses acceptance before vetting, with a clear message", async () => {
    const sponsors = (await (await call("GET", "/v1/studio/sponsors", users.editor)).json()) as { sponsors: Array<{ id: string }> };
    const created = await call("POST", "/v1/studio/orders", users.editor, { sponsorId: sponsors.sponsors[0]!.id, title: "Q1 package", amount: 900, currency: "usd" });
    expect(created.status).toBe(201);
    const { order } = (await created.json()) as { order: { id: string; currency: string } };
    expect(order.currency).toBe("USD");
    await call("PATCH", `/v1/studio/orders/${order.id}`, users.editor, { status: "vetting" });
    const res = await call("PATCH", `/v1/studio/orders/${order.id}`, users.editor, { status: "accepted" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { message: expect.stringContaining("vetting item") } });
  });
});

describe("public ads", () => {
  it("serves live ads per placement and counts clicks", async () => {
    const res = await app.request("/v1/public/ads?placement=article");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const { slots } = (await res.json()) as { slots: Array<{ key: string; booking: { id: string; sponsorName: string } | null }> };
    const slot = slots.find((s) => s.key === "article-end")!;
    expect(slot.booking?.sponsorName).toBe("ExamplePay (fictional)");

    const click = await app.request(`/v1/public/ads/${slot.booking!.id}/click`, { method: "POST" });
    expect(click.status).toBe(200);
    expect(click.headers.get("cache-control")).toBe("no-store");
    expect(await click.json()).toEqual({ url: "https://example.com/" });

    expect((await app.request("/v1/public/ads/00000000-0000-4000-8000-000000000000/click", { method: "POST" })).status).toBe(404);
    expect((await app.request("/v1/public/ads?placement=sidebar")).status).toBe(400);
  });

  it("shows an empty slot when nothing is booked", async () => {
    const { slots } = (await (await app.request("/v1/public/ads?placement=home")).json()) as { slots: Array<{ key: string; booking: unknown }> };
    expect(slots).toEqual([{ key: "home-banner", width: 1200, height: 250, booking: null }]);
  });
});
