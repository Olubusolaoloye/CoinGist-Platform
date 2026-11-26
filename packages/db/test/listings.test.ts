import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ListingInput } from "@coingist/types";
import { createCommerceRepository } from "../src/commerce.js";
import { createListingsRepository, type ListingsRepository } from "../src/listings.js";
import { createTestDb, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let l: ListingsRepository;
let writer: TestUser, editor: TestUser, reader: TestUser;
const day = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * day).toISOString();

const event = (over: Partial<ListingInput> = {}): ListingInput => ({
  kind: "event", category: "conference", title: "Africa Blockchain Week", summary: "Builders and regulators meet in Lagos.",
  details: "", url: "https://example.org/abw", imageUrl: null, imageAlt: null, organizer: "ABW", startsAt: at(10), endsAt: at(12),
  location: "Lagos, Nigeria", isOnline: false, reward: null, status: "draft", safetyChecked: false, ...over,
});
const opp = (over: Partial<ListingInput> = {}): ListingInput => ({
  kind: "opportunity", category: "grant", title: "Builder grant", summary: "Up to $10k for teams building payments.",
  details: "", url: "https://grants.example.org/apply", imageUrl: null, imageAlt: null, organizer: "Example Foundation",
  startsAt: null, endsAt: at(20), location: "Africa", isOnline: true, reward: "Up to $10,000", status: "draft", safetyChecked: false, ...over,
});

beforeAll(async () => {
  t = await createTestDb();
  l = createListingsRepository(t.db);
  writer = await t.createUser({ role: "writer" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser();
});
afterAll(() => t.close());

describe("events", () => {
  it("writers draft, editors publish; only published upcoming events are public, soonest first", async () => {
    const later = await l.create(writer.claims, event({ title: "Later summit", startsAt: at(30), endsAt: at(31) }));
    const soon = await l.create(writer.claims, event({ title: "Soon meetup", category: "meetup", startsAt: at(2), endsAt: at(2) }));
    await expect(l.update(writer.claims, soon.id, event({ title: "Soon meetup", category: "meetup", startsAt: at(2), endsAt: at(2), status: "published" })))
      .rejects.toMatchObject({ kind: "forbidden" });
    expect((await l.list("event", { scope: "upcoming", page: 1, pageSize: 10 })).items).toEqual([]);

    await l.update(editor.claims, later.id, event({ title: "Later summit", startsAt: at(30), endsAt: at(31), status: "published" }));
    await l.update(editor.claims, soon.id, event({ title: "Soon meetup", category: "meetup", startsAt: at(2), endsAt: at(2), status: "published" }));
    const up = await l.list("event", { scope: "upcoming", page: 1, pageSize: 10 });
    expect(up.items.map((e) => e.title)).toEqual(["Soon meetup", "Later summit"]);
    expect(up.items[0]).toMatchObject({ slug: "soon-meetup", publishedAt: expect.any(String) });
    expect((await l.list("event", { scope: "upcoming", category: "meetup", page: 1, pageSize: 10 })).total).toBe(1);
    expect(await l.get("event", "soon-meetup")).toMatchObject({ title: "Soon meetup", location: "Lagos, Nigeria" });
  });

  it("past events move to the past list; drafts and readers stay out", async () => {
    const past = await l.create(editor.claims, event({ title: "Last year's expo", startsAt: at(-40), endsAt: at(-39), status: "published" }));
    expect((await l.list("event", { scope: "past", page: 1, pageSize: 10 })).items.map((e) => e.id)).toContain(past.id);
    await expect(l.create(reader.claims, event({ title: "Reader event" }))).rejects.toMatchObject({ kind: "forbidden" });
    await l.create(writer.claims, event({ title: "Hidden draft" }));
    expect(await l.get("event", "hidden-draft")).toBeNull();
  });

  it("keeps slugs unique and stable once published", async () => {
    const a = await l.create(editor.claims, event({ title: "Same name", status: "published" }));
    const b = await l.create(editor.claims, event({ title: "Same name" }));
    expect([a.slug, b.slug]).toEqual(["same-name", "same-name-2"]);
    const renamed = await l.update(editor.claims, a.id, event({ title: "A new name", status: "published" }));
    expect(renamed.slug).toBe("same-name");
  });
});

describe("opportunities", () => {
  it("can't be published until an editor ticks the safety checklist, which records who and when", async () => {
    const o = await l.create(writer.claims, opp());
    await expect(l.update(editor.claims, o.id, opp({ status: "published" }))).rejects.toMatchObject({ kind: "conflict" });
    await expect(l.update(writer.claims, o.id, opp({ safetyChecked: true }))).rejects.toMatchObject({ kind: "forbidden" });
    const live = await l.update(editor.claims, o.id, opp({ status: "published", safetyChecked: true }));
    expect(live).toMatchObject({ status: "published", safetyChecked: true, checkedAt: expect.any(String) });
    const row = await t.pg.query<{ checked_by: string }>("select checked_by from public.listings where id = $1", [o.id]);
    expect(row.rows[0]!.checked_by).toBe(editor.id);
    expect((await l.list("opportunity", { scope: "open", page: 1, pageSize: 10 })).items.map((x) => x.id)).toContain(o.id);
  });

  it("moves to closed after the deadline", async () => {
    const o = await l.create(editor.claims, opp({ title: "Expired airdrop", category: "airdrop", endsAt: at(-1), status: "published", safetyChecked: true }));
    expect((await l.list("opportunity", { scope: "closed", page: 1, pageSize: 10 })).items.map((x) => x.id)).toContain(o.id);
    expect((await l.list("opportunity", { scope: "open", page: 1, pageSize: 10 })).items.map((x) => x.id)).not.toContain(o.id);
  });

  it("refuses links to blocked scam domains", async () => {
    await createCommerceRepository(t.db).blockDomain(editor.claims, { domain: "fake-drop.example", reason: "Drainer" });
    await expect(
      l.create(editor.claims, opp({ title: "Too good airdrop", url: "https://claim.fake-drop.example/now", status: "published", safetyChecked: true })),
    ).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("fake-drop.example") });
  });

  it("rejects non-https links and an event type on an opportunity", async () => {
    await expect(t.db.asUser(editor.claims, (q) => q.query(
      "insert into public.listings (kind, category, title, slug, summary, url, created_by) values ('opportunity','conference','Bad mix','bad-mix','A summary that is long enough','https://x.example',$1)",
      [editor.id],
    ))).rejects.toThrow();
    await expect(t.db.asUser(editor.claims, (q) => q.query(
      "insert into public.listings (kind, category, title, slug, summary, url, created_by) values ('opportunity','grant','Bad link','bad-link','A summary that is long enough','http://x.example',$1)",
      [editor.id],
    ))).rejects.toThrow();
  });
});
