import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { bearer, ORIGIN, setup, tokenFor, type TestDb, type TestUser } from "./helpers.js";

let t: TestDb;
let app: App;
let reader: TestUser, writer: TestUser;

beforeAll(async () => {
  ({ t, app } = await setup());
  reader = await t.createUser();
  writer = await t.createUser({ role: "writer" });
});
afterAll(() => t.close());

describe("authentication", () => {
  it("serves /health without auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects /v1/me without a token", async () => {
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthenticated" } });
  });

  it.each([
    ["garbage", async () => "not-a-jwt"],
    ["wrong secret", () => tokenFor(reader, { secret: "x".repeat(40) })],
    ["expired", () => tokenFor(reader, { expiresIn: "-1m" })],
    ["wrong issuer", () => tokenFor(reader, { issuer: "https://evil.example/auth/v1" })],
  ])("rejects a %s token", async (_label, make) => {
    const res = await app.request("/v1/me", { headers: bearer(await make()) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "invalid_token" } });
  });

  it("rejects a valid token for a user with no profile", async () => {
    const ghost = { id: "11111111-1111-4111-8111-111111111111", email: "ghost@x.test" };
    const res = await app.request("/v1/me", { headers: bearer(await tokenFor(ghost)) });
    expect(res.status).toBe(401);
  });

  it("returns the reader's profile and no permissions", async () => {
    const res = await app.request("/v1/me", { headers: bearer(await tokenFor(reader)) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { permissions: string[] };
    expect(body).toMatchObject({ user: { id: reader.id, role: "reader" }, mfaRequired: false });
    expect(body.permissions).toEqual([]);
  });

  it("tells staff without 2FA that MFA is required", async () => {
    const res = await app.request("/v1/me", {
      headers: bearer(await tokenFor(writer, { aal: "aal1" })),
    });
    expect(await res.json()).toMatchObject({ mfaRequired: true, mfaVerified: false });
  });

  it("reads the role from the database, not the token", async () => {
    await t.pg.query("update public.users set role = 'editor' where id = $1", [reader.id]);
    const res = await app.request("/v1/me", { headers: bearer(await tokenFor(reader)) });
    expect(await res.json()).toMatchObject({ user: { role: "editor" } });
    await t.pg.query("update public.users set role = 'reader' where id = $1", [reader.id]);
  });

  it("blocks suspended users", async () => {
    const u = await t.createUser();
    await t.pg.query("update public.users set status = 'suspended' where id = $1", [u.id]);
    const res = await app.request("/v1/me", { headers: bearer(await tokenFor(u)) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "account_inactive" } });
  });
});

describe("http hardening", () => {
  it("sets security headers", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("allows CORS only for configured origins", async () => {
    const ok = await app.request("/health", { headers: { origin: ORIGIN } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const bad = await app.request("/health", { headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rate limits per caller", async () => {
    const limited = await setup({ rateLimit: { windowMs: 60_000, max: 2 } });
    const headers = { "x-forwarded-for": "203.0.113.9", authorization: "Bearer bogus" };
    expect((await limited.app.request("/v1/me", { headers })).status).toBe(401);
    expect((await limited.app.request("/v1/me", { headers })).status).toBe(401);
    const third = await limited.app.request("/v1/me", { headers });
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
    // A different client is unaffected.
    const other = await limited.app.request("/v1/me", { headers: { "x-forwarded-for": "198.51.100.1" } });
    expect(other.status).toBe(401);
    await limited.t.close();
  });
});
