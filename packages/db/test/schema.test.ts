import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  POST_STATUSES,
  POST_TYPES,
  REACTION_KINDS,
  ROLES,
  SPONSORED_ORDER_STATUSES,
  SUBSCRIBER_STATUSES,
  USER_STATUSES,
} from "@coingist/types";
import { createTestDb, type TestDb } from "./harness.js";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("schema", () => {
  it.each([
    ["user_role", ROLES],
    ["user_status", USER_STATUSES],
    ["post_type", POST_TYPES],
    ["post_status", POST_STATUSES],
    ["sponsored_order_status", SPONSORED_ORDER_STATUSES],
    ["invoice_status", INVOICE_STATUSES],
    ["subscriber_status", SUBSCRIBER_STATUSES],
    ["payment_status", PAYMENT_STATUSES],
    ["reaction_kind", REACTION_KINDS],
  ])("enum %s matches packages/types", async (name, values) => {
    const res = await t.pg.query<{ v: string }>(
      `select e.enumlabel as v from pg_enum e join pg_type ty on ty.oid = e.enumtypid
       where ty.typname = $1 order by e.enumsortorder`,
      [name],
    );
    expect(res.rows.map((r) => r.v)).toEqual([...values]);
  });

  it("has RLS enabled on every public table", async () => {
    const res = await t.pg.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(res.rows).toEqual([]);
  });

  it("creates a reader profile when someone signs up", async () => {
    const u = await t.createUser({ name: "Ada Obi" });
    const res = await t.pg.query("select role, status, name from public.users where id = $1", [
      u.id,
    ]);
    expect(res.rows[0]).toEqual({ role: "reader", status: "active", name: "Ada Obi" });
  });

  it("mirrors verified TOTP factors into two_factor_enabled", async () => {
    const u = await t.createUser({ role: "writer" });
    await t.pg.query(
      "insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'unverified')",
      [u.id],
    );
    const flag = async () =>
      (
        await t.pg.query<{ f: boolean }>(
          "select two_factor_enabled f from public.users where id = $1",
          [u.id],
        )
      ).rows[0]!.f;
    expect(await flag()).toBe(false);
    await t.pg.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [u.id]);
    expect(await flag()).toBe(true);
    await t.pg.query("delete from auth.mfa_factors where user_id = $1", [u.id]);
    expect(await flag()).toBe(false);
  });

  it("rejects sponsored posts without a sponsor", async () => {
    const u = await t.createUser({ role: "writer" });
    await expect(
      t.pg.query(
        `insert into public.posts (type, title, slug, author_id, is_sponsored)
         values ('sponsored', 'Ad', 'ad-no-sponsor', $1, true)`,
        [u.id],
      ),
    ).rejects.toThrow(/posts_sponsor_required/);
  });

  it("rejects published posts without a human approver, even for superuser", async () => {
    const u = await t.createUser({ role: "editor" });
    await expect(
      t.pg.query(
        `insert into public.posts (type, title, slug, author_id, status, published_at)
         values ('news', 'Auto', 'auto-published', $1, 'published', now())`,
        [u.id],
      ),
    ).rejects.toThrow(/posts_human_approval/);
  });

  it("keeps audit_logs append-only", async () => {
    await t.pg.query(
      "insert into public.audit_logs (action, entity) values ('test.event', 'test')",
    );
    await expect(t.pg.query("delete from public.audit_logs")).rejects.toThrow(/append-only/);
    await expect(t.pg.query("update public.audit_logs set action = 'x'")).rejects.toThrow(
      /append-only/,
    );
  });
});
