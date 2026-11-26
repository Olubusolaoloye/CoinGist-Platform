import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness.js";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("transaction login", () => {
  it("sets the role and claims for the transaction only", async () => {
    const seen = await t.db.asUser(null, (q) =>
      q.query<{ role: string; claims: string }>("select current_user as role, current_setting('request.jwt.claims') as claims"),
    );
    expect(seen[0]!.role).toBe("anon");
    expect(JSON.parse(seen[0]!.claims)).toEqual({ role: "anon" });
    // Nothing leaks out of the transaction.
    const after = await t.pg.query<{ role: string }>("select current_user as role");
    expect(after.rows[0]!.role).not.toBe("anon");
  });

  it("escapes quotes and SQL in claims instead of running them", async () => {
    const sub = "00000000-0000-0000-0000-000000000001";
    const email = "x'); set local role service_role; select ('";
    const seen = await t.db.asUser({ sub, email, aal: "aal1" }, (q) =>
      q.query<{ role: string; email: string }>("select current_user as role, auth.jwt() ->> 'email' as email"),
    );
    expect(seen[0]).toEqual({ role: "authenticated", email });
  });
});
