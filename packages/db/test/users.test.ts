import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgRepositories, DomainError, type Repositories } from "../src/index.js";
import { createTestDb, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let repos: Repositories;
let admin: TestUser, editor: TestUser, reader: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  repos = createPgRepositories(t.db);
  admin = await t.createUser({ role: "admin" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser();
});
afterAll(() => t.close());

describe("user role management", () => {
  it("lets an MFA-verified admin promote a user, and audits it", async () => {
    const updated = await repos.users.setRole(admin.claims, reader.id, "writer");
    expect(updated.role).toBe("writer");

    const logs = await repos.audit.list(admin.claims, { limit: 10, entity: "users" });
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      action: "user.role_changed",
      entityId: reader.id,
      metadata: { from: "reader", to: "writer" },
    });
    await repos.users.setRole(admin.claims, reader.id, "reader");
  });

  it("refuses role changes from editors and from admins without 2FA", async () => {
    await expect(repos.users.setRole(editor.claims, reader.id, "admin")).rejects.toMatchObject({
      kind: "forbidden",
    });
    await expect(repos.users.setRole(admin.claimsNoMfa, reader.id, "writer")).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("refuses to demote the last active admin", async () => {
    await expect(repos.users.setRole(admin.claims, admin.id, "editor")).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("returns not_found for unknown users", async () => {
    await expect(
      repos.users.setRole(admin.claims, "00000000-0000-0000-0000-000000000000", "writer"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("drops a suspended admin's privileges immediately", async () => {
    const second = await t.createUser({ role: "admin" });
    await repos.users.setStatus(admin.claims, second.id, "suspended");
    await expect(repos.users.setRole(second.claims, reader.id, "writer")).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("stops admins changing their own status", async () => {
    await expect(repos.users.setStatus(admin.claims, admin.id, "suspended")).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("lets only staff list users", async () => {
    expect((await repos.users.list(admin.claims, { limit: 50, offset: 0 })).length).toBeGreaterThan(2);
    expect(await repos.users.list(reader.claims, { limit: 50, offset: 0 })).toHaveLength(1);
  });
});
