import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNewsletterRepository, type NewsletterRepository } from "../src/newsletter.js";
import { createTestDb, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let nl: NewsletterRepository;
let admin: TestUser, editor: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  nl = createNewsletterRepository(t.db);
  admin = await t.createUser({ role: "admin" });
  editor = await t.createUser({ role: "editor" });
});
afterAll(() => t.close());

const backdate = (email: string) =>
  t.pg.query("update public.subscribers set last_signup_at = now() - interval '1 hour' where lower(email) = lower($1)", [email]);

describe("signups", () => {
  it("creates a pending subscriber with consent time, lowercased", async () => {
    const r = await nl.recordSignup({ email: "Ada@Example.com", lists: ["daily-gist"], source: "footer" });
    expect(r).toMatchObject({ outcome: "created", needsSync: true, subscriber: { email: "ada@example.com", status: "pending", syncStatus: "pending" } });
    const row = await t.pg.query<{ consented_at: Date | null }>("select consented_at from public.subscribers where email = 'ada@example.com'");
    expect(row.rows[0]!.consented_at).not.toBeNull();
  });

  it("doesn't duplicate, and doesn't re-send confirmation inside the cooldown", async () => {
    const again = await nl.recordSignup({ email: "ada@example.com", lists: ["daily-gist"], source: "article" });
    expect(again).toMatchObject({ outcome: "unchanged", needsSync: false });
    await backdate("ada@example.com");
    expect((await nl.recordSignup({ email: "ADA@example.com", lists: ["daily-gist"], source: "article" })).needsSync).toBe(true);
    const count = await t.pg.query<{ n: number }>("select count(*)::int n from public.subscribers where lower(email) = 'ada@example.com'");
    expect(count.rows[0]!.n).toBe(1);
  });

  it("adds new lists to an existing subscriber", async () => {
    const r = await nl.recordSignup({ email: "ada@example.com", lists: ["weekly-wrap"], source: "newsletter-page" });
    expect(r).toMatchObject({ outcome: "lists-updated", needsSync: true, subscriber: { lists: ["daily-gist", "weekly-wrap"] } });
  });

  it("resubscribes someone who unsubscribed", async () => {
    await nl.recordSignup({ email: "gone@example.com", lists: ["daily-gist"], source: "footer" });
    await nl.applyProviderStatus({ email: "gone@example.com" }, "unsubscribed");
    const r = await nl.recordSignup({ email: "gone@example.com", lists: ["weekly-wrap"], source: "footer" });
    expect(r).toMatchObject({ outcome: "resubscribed", needsSync: true, subscriber: { status: "pending", lists: ["weekly-wrap"], unsubscribedAt: null } });
  });

  it("rejects unknown lists at the database", async () => {
    await expect(
      t.pg.query("insert into public.subscribers (email, lists) values ('x@example.com', array['spam-list'])"),
    ).rejects.toThrow(/subscribers_lists_known/);
  });
});

describe("sync with the newsletter tool", () => {
  it("tracks success, failure and retries", async () => {
    const { subscriber } = await nl.recordSignup({ email: "sync@example.com", lists: ["daily-gist"], source: "footer" });
    await nl.markSyncFailed(subscriber.id, "HTTP 503");
    expect((await nl.pendingSync(50, 5)).map((s) => s.email)).toContain("sync@example.com");
    await nl.markSynced(subscriber.id, "sub_123", "pending");
    expect((await nl.pendingSync(50, 5)).map((s) => s.email)).not.toContain("sync@example.com");
  });

  it("gives up after the maximum attempts", async () => {
    const { subscriber } = await nl.recordSignup({ email: "flaky@example.com", lists: ["daily-gist"], source: "footer" });
    for (let i = 0; i < 3; i++) await nl.markSyncFailed(subscriber.id, "boom");
    expect((await nl.pendingSync(50, 3)).map((s) => s.email)).not.toContain("flaky@example.com");
  });

  it("applies status changes by provider id or email", async () => {
    expect(await nl.applyProviderStatus({ externalId: "sub_123" }, "active")).toBe(true);
    const row = await t.pg.query<{ status: string; confirmed_at: Date | null }>(
      "select status, confirmed_at from public.subscribers where external_id = 'sub_123'",
    );
    expect(row.rows[0]).toMatchObject({ status: "active" });
    expect(row.rows[0]!.confirmed_at).not.toBeNull();
    expect(await nl.applyProviderStatus({ externalId: "sub_unknown" }, "active")).toBe(false);
    expect(await nl.applyProviderStatus({}, "active")).toBe(false);
  });
});

describe("admin views", () => {
  it("are admin-only (RLS)", async () => {
    expect((await nl.list(editor.claims, { page: 1, pageSize: 50 })).items).toEqual([]);
    expect((await nl.list(admin.claims, { page: 1, pageSize: 50 })).total).toBeGreaterThan(2);
    expect((await nl.list(admin.claims, { syncStatus: "failed", page: 1, pageSize: 50 })).items.every((s) => s.syncStatus === "failed")).toBe(true);
  });

  it("reports stats and requeues failed syncs", async () => {
    const stats = await nl.stats(admin.claims);
    expect(stats.byList["daily-gist"]).toBeGreaterThan(0);
    expect(stats.failedSyncs).toBeGreaterThan(0);
    expect(await nl.retryFailed(editor.claims)).toBe(0);
    expect(await nl.retryFailed(admin.claims)).toBe(stats.failedSyncs);
    expect((await nl.stats(admin.claims)).failedSyncs).toBe(0);
  });

  it("keeps subscribers invisible to anonymous and reader sessions", async () => {
    const reader = await t.createUser();
    for (const claims of [null, reader.claims]) {
      expect(await t.db.asUser(claims, (q) => q.query("select 1 from public.subscribers"))).toEqual([]);
    }
  });
});
