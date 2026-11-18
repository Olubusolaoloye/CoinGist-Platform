import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@coingist/types";
import type { App } from "../src/app.js";
import { insertPost } from "@coingist/db/testing";
import { bearer, setup, tokenFor, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let users: Record<Role, TestUser>;
let target: TestUser;

beforeAll(async () => {
  ({ t, app } = await setup());
  users = {
    reader: await t.createUser(),
    writer: await t.createUser({ role: "writer" }),
    editor: await t.createUser({ role: "editor" }),
    admin: await t.createUser({ role: "admin" }),
  };
  target = await t.createUser();
});
afterAll(() => t.close());

type Call = { method: string; path: () => string; body?: unknown };
const ENDPOINTS: Record<string, Call> = {
  "GET /v1/admin/users": { method: "GET", path: () => "/v1/admin/users" },
  "PATCH role": {
    method: "PATCH",
    path: () => `/v1/admin/users/${target.id}/role`,
    body: { role: "reader" },
  },
  "PATCH status": {
    method: "PATCH",
    path: () => `/v1/admin/users/${target.id}/status`,
    body: { status: "active" },
  },
  "GET audit-logs": { method: "GET", path: () => "/v1/admin/audit-logs" },
  "GET dashboard": { method: "GET", path: () => "/v1/admin/dashboard" },
  "GET payments": { method: "GET", path: () => "/v1/admin/payments" },
  "GET unpaid stories": { method: "GET", path: () => "/v1/admin/payments/unpaid-stories" },
};

async function call(endpoint: Call, token?: string) {
  return app.request(endpoint.path(), {
    method: endpoint.method,
    headers: {
      ...(token ? bearer(token) : {}),
      ...(endpoint.body ? { "content-type": "application/json" } : {}),
    },
    ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
  });
}

describe("admin route access matrix", () => {
  // [who, aal, expected status]
  const matrix: Array<[Role | "anon", "aal1" | "aal2", number, string?]> = [
    ["anon", "aal2", 401, "unauthenticated"],
    ["reader", "aal2", 403, "forbidden"],
    ["writer", "aal2", 403, "forbidden"],
    ["editor", "aal2", 403, "forbidden"],
    ["admin", "aal1", 403, "mfa_required"],
    ["admin", "aal2", 200],
  ];

  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    it.each(matrix)(`${name}: %s (%s) -> %i`, async (who, aal, status, code) => {
      const token = who === "anon" ? undefined : await tokenFor(users[who], { aal });
      const res = await call(endpoint, token);
      expect(res.status).toBe(status);
      if (code) expect(await res.json()).toMatchObject({ error: { code } });
    });
  }
});

describe("role management", () => {
  const patchRole = async (id: string, body: unknown, actor = users.admin) =>
    app.request(`/v1/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { ...bearer(await tokenFor(actor)), "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("promotes a user and records it in the audit log", async () => {
    const res = await patchRole(target.id, { role: "writer" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { id: target.id, role: "writer" } });

    const logs = await app.request(`/v1/admin/audit-logs?entity=users&entityId=${target.id}`, {
      headers: bearer(await tokenFor(users.admin)),
    });
    expect(((await logs.json()) as { logs: unknown[] }).logs[0]).toMatchObject({
      action: "user.role_changed",
      actorId: users.admin.id,
      metadata: { from: "reader", to: "writer" },
    });
  });

  it("validates input", async () => {
    expect((await patchRole(target.id, { role: "superadmin" })).status).toBe(400);
    expect((await patchRole(target.id, { role: "writer", extra: 1 })).status).toBe(400);
    expect((await patchRole("not-a-uuid", { role: "writer" })).status).toBe(400);
  });

  it("returns 404 for unknown users and 409 for demoting the last admin", async () => {
    expect((await patchRole("00000000-0000-4000-8000-000000000000", { role: "writer" })).status).toBe(
      404,
    );
    const res = await patchRole(users.admin.id, { role: "editor" });
    expect(res.status).toBe(409);
  });

  it("revokes access on the very next request after demotion", async () => {
    const second = await t.createUser({ role: "admin" });
    const token = await tokenFor(second);
    expect((await call(ENDPOINTS["GET /v1/admin/users"]!, token)).status).toBe(200);
    await patchRole(second.id, { role: "reader" });
    expect((await call(ENDPOINTS["GET /v1/admin/users"]!, token)).status).toBe(403);
  });
});

describe("dashboards and payouts", () => {
  const get = async (path: string, who: TestUser, aal: "aal1" | "aal2" = "aal2") =>
    app.request(path, { headers: bearer(await tokenFor(who, { aal })) });
  const send = async (method: string, path: string, body: unknown, who = users.admin) =>
    app.request(path, {
      method,
      headers: { ...bearer(await tokenFor(who)), "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("the editor dashboard is for editors and admins, never cached", async () => {
    expect((await get("/v1/studio/dashboard", users.writer)).status).toBe(403);
    expect((await get("/v1/studio/dashboard", users.editor, "aal1")).status).toBe(403);
    const res = await get("/v1/studio/dashboard?from=2026-11-16", users.editor);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { dashboard } = (await res.json()) as { dashboard: { calendar: { from: string } } };
    expect(dashboard.calendar.from).toBe("2026-11-16");
    expect((await get("/v1/studio/dashboard?from=2026-13-45", users.editor)).status).toBe(400);
    expect((await get("/v1/studio/dashboard", users.admin)).status).toBe(200);
  });

  it("admin responses are never cached", async () => {
    const res = await get("/v1/admin/dashboard", users.admin);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("writers see their own earnings; readers can't", async () => {
    expect((await get("/v1/studio/earnings", users.reader)).status).toBe(403);
    const res = await get("/v1/studio/earnings", users.writer);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ earnings: { payments: [], totals: [] } });
  });

  it("records and pays a writer, with validation and clear conflicts", async () => {
    const postId = await insertPost(t.pg, { authorId: users.writer.id, status: "published", approverId: users.editor.id });
    const body = { writerId: users.writer.id, postId, amount: "120", currency: "ngn" };

    expect((await send("POST", "/v1/admin/payments", { ...body, amount: "-5" })).status).toBe(400);
    expect((await send("POST", "/v1/admin/payments", { ...body, amount: "1.234" })).status).toBe(400);
    expect((await send("POST", "/v1/admin/payments", { ...body, currency: "NAIRA" })).status).toBe(400);
    expect((await send("POST", "/v1/admin/payments", body, users.editor)).status).toBe(403);

    const created = await send("POST", "/v1/admin/payments", body);
    expect(created.status).toBe(201);
    const { payment } = (await created.json()) as { payment: { id: string; currency: string; status: string } };
    expect(payment).toMatchObject({ currency: "NGN", status: "pending" });

    const dup = await send("POST", "/v1/admin/payments", body);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: { message: expect.stringMatching(/already has a payment/) } });

    expect((await send("PATCH", `/v1/admin/payments/${payment.id}`, { status: "paid" })).status).toBe(409);
    expect((await send("PATCH", `/v1/admin/payments/${payment.id}`, { status: "approved" })).status).toBe(200);
    const paid = await send("PATCH", `/v1/admin/payments/${payment.id}`, { status: "paid" });
    expect(await paid.json()).toMatchObject({ payment: { status: "paid", paidAt: expect.any(String) } });
    expect((await send("PATCH", `/v1/admin/payments/${payment.id}`, { status: "pending" })).status).toBe(400);
    expect((await send("PATCH", "/v1/admin/payments/00000000-0000-4000-8000-000000000000", { status: "approved" })).status).toBe(404);

    const mine = await get("/v1/studio/earnings", users.writer);
    expect(await mine.json()).toMatchObject({ earnings: { payments: [{ id: payment.id, status: "paid" }] } });
  });
});
