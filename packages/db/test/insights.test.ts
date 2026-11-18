import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInsightsRepository, weekStart, type InsightsRepository } from "../src/insights.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let r: InsightsRepository;
let writer: TestUser, writer2: TestUser, editor: TestUser, admin: TestUser, reader: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  r = createInsightsRepository(t.db);
  writer = await t.createUser({ role: "writer", name: "Wanjiru Writer" });
  writer2 = await t.createUser({ role: "writer", name: "Wale Writer" });
  editor = await t.createUser({ role: "editor" });
  admin = await t.createUser({ role: "admin" });
  reader = await t.createUser({ role: "reader" });
});
afterAll(() => t.close());

const published = (authorId: string, daysAgo = 1) =>
  insertPost(t.pg, { authorId, status: "published", approverId: editor.id, publishedAt: new Date(Date.now() - daysAgo * 86_400_000) });

describe("weekStart", () => {
  it("returns the Monday of the week in UTC", () => {
    expect(weekStart(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-16"); // Wednesday
    expect(weekStart(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16"); // Monday
    expect(weekStart(new Date("2026-11-22T12:00:00Z"))).toBe("2026-11-16"); // Sunday
  });
});

describe("editor dashboard", () => {
  it("counts, queues, calendar, throughput and writer activity", async () => {
    const mine = await insertPost(t.pg, { authorId: editor.id, status: "in_review", title: "Editor's own" });
    const waiting = await insertPost(t.pg, { authorId: writer.id, status: "in_review", title: "Waiting" });
    const ready = await insertPost(t.pg, { authorId: writer.id, status: "approved", approverId: editor.id, title: "Ready" });
    const stale = await insertPost(t.pg, { authorId: writer2.id, status: "draft", title: "Old draft" });
    await t.pg.query("alter table public.posts disable trigger user");
    await t.pg.query("update public.posts set updated_at = now() - interval '10 days' where id = $1", [stale]);
    await t.pg.query("alter table public.posts enable trigger user");
    const scheduled = await insertPost(t.pg, { authorId: writer.id, status: "scheduled", approverId: editor.id, title: "Tomorrow" });
    const today = await published(writer.id, 0);
    await published(writer.id, 40); // outside the 30-day window

    const d = await r.editorDashboard(editor.claims, {});
    expect(d.counts.in_review).toBe(2);
    expect(d.reviewQueue.map((p) => p.id)).toEqual([waiting]); // not the editor's own story
    expect(d.reviewQueue.map((p) => p.id)).not.toContain(mine);
    expect(d.readyToSchedule.map((p) => p.id)).toEqual([ready]);
    expect(d.stalled.map((p) => p.id)).toEqual([stale]);

    expect(d.calendar.days).toHaveLength(14);
    expect(d.calendar.from).toBe(weekStart(new Date()));
    const onCalendar = d.calendar.days.flatMap((day) => day.entries.map((e) => [e.id, e.status]));
    expect(onCalendar).toContainEqual([scheduled, "scheduled"]);
    expect(onCalendar).toContainEqual([today, "published"]);

    expect(d.publishedByDay).toHaveLength(30);
    expect(d.publishedByDay.at(-1)!.count).toBe(1);
    expect(d.publishedByDay.reduce((n, x) => n + x.count, 0)).toBe(1);
    expect(d.sectionMix).toEqual([{ type: "news", count: 1 }]);

    const w = d.writers.find((x) => x.id === writer.id)!;
    expect(w).toMatchObject({ name: "Wanjiru Writer", inReview: 1, published30d: 1 });
    expect(d.writers[0]!.id).toBe(writer.id); // most published first
  });

  it("pages the calendar from any date", async () => {
    const d = await r.editorDashboard(editor.claims, { from: "2026-01-05" });
    expect(d.calendar.days[0]!.date).toBe("2026-01-05");
    expect(d.calendar.days[13]!.date).toBe("2026-01-18");
  });

  it("a writer only ever sees their own stories in it (RLS)", async () => {
    const d = await r.editorDashboard(writer2.claims, {});
    expect(d.counts.in_review).toBe(0);
    expect(d.counts.draft).toBe(1);
  });
});

describe("payouts", () => {
  it("admins record, approve and pay; each step is audited and paid is final", async () => {
    const post = await published(writer.id);
    const p = await r.createPayment(admin.claims, { writerId: writer.id, postId: post, amount: "150.5", currency: "NGN", note: "Feature" });
    expect(p).toMatchObject({ status: "pending", amount: "150.50", currency: "NGN", writer: { name: "Wanjiru Writer" }, paidAt: null });
    expect((await r.unpaidStories(admin.claims)).map((s) => s.id)).not.toContain(post);

    await expect(r.updatePayment(admin.claims, p.id, { status: "paid" })).rejects.toMatchObject({ kind: "conflict" });
    await r.updatePayment(admin.claims, p.id, { status: "approved" });
    const paid = await r.updatePayment(admin.claims, p.id, { status: "paid" });
    expect(paid.paidAt).not.toBeNull();
    await expect(r.updatePayment(admin.claims, p.id, { status: "cancelled" })).rejects.toMatchObject({ kind: "conflict" });

    const audit = await t.pg.query<{ action: string }>(
      "select action from public.audit_logs where entity_id = $1 order by created_at", [p.id],
    );
    expect(audit.rows.map((a) => a.action)).toEqual([
      "writer_payment.created", "writer_payment.status_changed", "writer_payment.status_changed",
    ]);
  });

  it("pays a story once, unless the first payment was cancelled", async () => {
    const post = await published(writer2.id);
    const first = await r.createPayment(admin.claims, { writerId: writer2.id, postId: post, amount: "80", currency: "USD", note: null });
    await expect(
      r.createPayment(admin.claims, { writerId: writer2.id, postId: post, amount: "80", currency: "USD", note: null }),
    ).rejects.toThrow(/already has a payment/);
    await r.updatePayment(admin.claims, first.id, { status: "cancelled" });
    await expect(
      r.createPayment(admin.claims, { writerId: writer2.id, postId: post, amount: "90", currency: "USD", note: null }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("rejects payments for someone else's story, unpublished stories and non-staff", async () => {
    const theirs = await published(writer2.id);
    const draft = await insertPost(t.pg, { authorId: writer.id });
    const base = { amount: "10", currency: "USD", note: null };
    await expect(r.createPayment(admin.claims, { ...base, writerId: writer.id, postId: theirs })).rejects.toThrow(/someone else/);
    await expect(r.createPayment(admin.claims, { ...base, writerId: writer.id, postId: draft })).rejects.toThrow(/published/);
    await expect(r.createPayment(admin.claims, { ...base, writerId: reader.id, postId: null })).rejects.toThrow(/staff writers/);
  });

  it("the amount is locked after approval, and payments can't be deleted", async () => {
    const p = await r.createPayment(admin.claims, { writerId: writer.id, postId: null, amount: "25", currency: "USD", note: "Bonus" });
    await r.updatePayment(admin.claims, p.id, { status: "approved" });
    await expect(
      t.db.asUser(admin.claims, (q) => q.query("update public.writer_payments set amount = 999 where id = $1", [p.id])),
    ).rejects.toThrow(/amount is fixed/);
    await expect(
      t.db.asUser(admin.claims, (q) => q.query("delete from public.writer_payments where id = $1", [p.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.db.asUser(admin.claims, (q) => q.query("update public.writer_payments set paid_at = now() where id = $1", [p.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("only admins manage payments; writers see only their own earnings", async () => {
    const base = { writerId: writer.id, postId: null, amount: "10", currency: "USD", note: null };
    await expect(r.createPayment(editor.claims, base)).rejects.toMatchObject({ kind: "forbidden" });
    await expect(r.createPayment(writer.claims, base)).rejects.toMatchObject({ kind: "forbidden" });
    await expect(r.createPayment(admin.claimsNoMfa, base)).rejects.toMatchObject({ kind: "forbidden" });
    expect(await r.listPayments(editor.claims, {})).toEqual([]);

    const mine = await r.myEarnings(writer.claims);
    expect(mine.payments.length).toBeGreaterThan(0);
    expect(mine.payments.every((p) => p.writer.id === writer.id)).toBe(true);
    expect(mine.totals).toContainEqual({ status: "paid", currency: "NGN", amount: "150.50", count: 1 });
    expect(mine.publishedAllTime).toBeGreaterThan(0);
    expect((await r.myEarnings(writer2.claims)).payments.every((p) => p.writer.id === writer2.id)).toBe(true);
  });
});

describe("admin dashboard", () => {
  it("summarises team, payouts, sponsorship, ads and recent activity", async () => {
    const d = await r.adminDashboard(admin.claims);
    expect(d.team.byRole.writer).toBe(2);
    expect(d.team.byRole.reader).toBe(1);
    // Test users haven't set up 2FA, so all staff are flagged.
    expect(d.team.staffWithout2fa.map((u) => u.id)).toEqual(expect.arrayContaining([writer.id, editor.id, admin.id]));
    expect(d.team.staffWithout2fa.map((u) => u.id)).not.toContain(reader.id);
    expect(d.payouts.totals).toContainEqual({ status: "paid", currency: "NGN", amount: "150.50", count: 1 });
    expect(d.payouts.unpaidStories).toBeGreaterThan(0);
    expect(d.recentActivity[0]!.action).toMatch(/^writer_payment\./);
    expect(d.recentActivity[0]!.actorName).toBeTruthy();
    expect(d.ads).toEqual({ live: 0, liveClicks: 0, awaitingApproval: 0 });
  });

  it("editors can't read the audit trail through it", async () => {
    const d = await r.adminDashboard(editor.claims);
    expect(d.recentActivity).toEqual([]);
  });
});
