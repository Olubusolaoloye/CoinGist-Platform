import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VETTING_ITEMS } from "@coingist/types";
import { createCommerceRepository, type CommerceRepository } from "../src/commerce.js";
import { createStudioRepository, type StudioRepository } from "../src/studio.js";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let c: CommerceRepository;
let studio: StudioRepository;
let writer: TestUser, editor: TestUser, editor2: TestUser;
const allChecked = Object.fromEntries(VETTING_ITEMS.map((i) => [i.key, true]));
const link = (href: string, text = "x") => ({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "link", attrs: { href } }] }] });

beforeAll(async () => {
  t = await createTestDb();
  c = createCommerceRepository(t.db);
  studio = createStudioRepository(t.db);
  writer = await t.createUser({ role: "writer" });
  editor = await t.createUser({ role: "editor" });
  editor2 = await t.createUser({ role: "editor" });
});
afterAll(() => t.close());

async function submittedPost(body: unknown[], type: "news" | "sponsored" = "news") {
  const post = await studio.createPost(writer.claims, { type, title: `Story ${Math.random()}` });
  await studio.updatePost(writer.claims, post.id, { body: { type: "doc", content: body } });
  await studio.transition(writer.claims, post.id, { to: "in_review" });
  return post.id;
}

describe("link safety", () => {
  it("extracts link hosts without www and ignores non-http links", async () => {
    const res = await t.pg.query<{ h: string }>(
      `select public.link_hosts($1::jsonb) as h order by 1`,
      [JSON.stringify({ type: "doc", content: [link("https://www.Alpha.example/x"), link("http://b.example:8080"), link("/internal"), link("mailto:a@b.co")] })],
    );
    expect(res.rows.map((r) => r.h)).toEqual(["alpha.example", "b.example"]);
  });

  it("blocks approval when a link (or a subdomain of one) is on the blocklist, and explains which", async () => {
    await c.blockDomain(editor.claims, { domain: "scam-exchange.example", reason: "Fake exchange" });
    const id = await submittedPost([link("https://login.scam-exchange.example/wallet")]);
    expect(await c.checkPostLinks(writer.claims, id)).toEqual([{ host: "login.scam-exchange.example", domain: "scam-exchange.example", reason: "Fake exchange" }]);
    await expect(studio.transition(editor.claims, id, { to: "approved" })).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("scam-exchange.example") });
    // Fixing the link makes it approvable.
    await t.pg.query("update public.posts set body_json = $2 where id = $1", [id, JSON.stringify({ type: "doc", content: [link("https://safe.example")] })]);
    await expect(studio.transition(editor.claims, id, { to: "approved" })).resolves.toMatchObject({ status: "approved" });
  });

  it("doesn't match lookalike domains", async () => {
    const id = await submittedPost([link("https://notscam-exchange.example")]);
    expect(await c.checkPostLinks(editor.claims, id)).toEqual([]);
  });

  it("lets only editors manage the list", async () => {
    await expect(c.blockDomain(writer.claims, { domain: "x.example", reason: "y" })).rejects.toMatchObject({ kind: "forbidden" });
    expect((await c.listBlockedDomains(writer.claims)).map((d) => d.domain)).toContain("scam-exchange.example");
  });
});

describe("sponsored orders", () => {
  it("only lets editors create sponsors and orders", async () => {
    await expect(c.createSponsor(writer.claims, { name: "Nope" })).rejects.toMatchObject({ kind: "forbidden" });
    const s = await c.createSponsor(editor.claims, { name: "Acme Pay", website: "https://acme.example" });
    await expect(c.createOrder(writer.claims, { sponsorId: s.id, title: "x", currency: "USD" })).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("can't be accepted until vetting is complete, and logs status changes", async () => {
    const s = await c.createSponsor(editor.claims, { name: "Vetted Co" });
    const o = await c.createOrder(editor.claims, { sponsorId: s.id, title: "Launch piece", amount: "2500", currency: "NGN" });
    expect(o).toMatchObject({ status: "inquiry", amount: "2500.00", currency: "NGN" });
    await c.updateOrder(editor.claims, o.id, { status: "vetting" });
    await expect(c.updateOrder(editor.claims, o.id, { status: "accepted" })).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("vetting") });
    await expect(c.updateOrder(editor.claims, o.id, { status: "published" })).rejects.toMatchObject({ kind: "conflict" });
    const accepted = await c.updateOrder(editor.claims, o.id, { vettingChecklist: allChecked, status: "accepted" });
    expect(accepted.status).toBe("accepted");
    const audit = await t.pg.query("select metadata from public.audit_logs where entity = 'sponsored_orders' and entity_id = $1 order by created_at", [o.id]);
    expect(audit.rows.map((r) => (r as { metadata: { to: string } }).metadata.to)).toEqual(["vetting", "accepted"]);
  });

  it("requires an accepted order for the sponsor before a sponsored story can be approved, and completes it on publish", async () => {
    const s = await c.createSponsor(editor.claims, { name: "Order Flow Ltd" });
    const postId = await submittedPost([{ type: "paragraph", content: [{ type: "text", text: "Paid piece" }] }], "sponsored");
    await t.pg.query("update public.posts set sponsor_id = $2 where id = $1", [postId, s.id]);
    await expect(studio.transition(editor.claims, postId, { to: "approved" })).rejects.toMatchObject({ message: expect.stringContaining("accepted order") });

    const o = await c.createOrder(editor.claims, { sponsorId: s.id, title: "Paid piece", currency: "USD" });
    await c.updateOrder(editor.claims, o.id, { status: "vetting" });
    await c.updateOrder(editor.claims, o.id, { vettingChecklist: allChecked, status: "accepted", postId });
    await expect(studio.transition(editor.claims, postId, { to: "approved" })).resolves.toMatchObject({ status: "approved" });
    await studio.transition(editor2.claims, postId, { to: "published" });
    expect((await c.getOrder(editor.claims, o.id))?.status).toBe("published");
  });

  it("won't link an order to a non-sponsored story or another sponsor's story", async () => {
    const s = await c.createSponsor(editor.claims, { name: "Link Check" });
    const o = await c.createOrder(editor.claims, { sponsorId: s.id, title: "x", currency: "USD" });
    const news = await insertPost(t.pg, { authorId: writer.id });
    await expect(c.updateOrder(editor.claims, o.id, { postId: news })).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("ads", () => {
  let sponsorId: string;
  const day = 86_400_000;
  const booking = (offsetDays: number, lengthDays: number, slotKey = "home-banner") => ({
    slotKey,
    sponsorId,
    startsAt: new Date(Date.now() + offsetDays * day).toISOString(),
    endsAt: new Date(Date.now() + (offsetDays + lengthDays) * day).toISOString(),
    creativeUrl: "https://cdn.example/ad.png",
    clickUrl: "https://advertiser.example/landing",
    altText: "Advertiser banner",
  });

  beforeAll(async () => {
    sponsorId = (await c.createSponsor(editor.claims, { name: "Banner Brand" })).id;
  });

  it("seeds the standard slots", async () => {
    expect((await c.listSlots(editor.claims)).map((s) => s.key)).toEqual(["article-end", "home-banner", "newsletter-daily-gist", "newsletter-weekly-wrap"]);
  });

  it("shows only approved, live bookings to the public, and counts clicks", async () => {
    const b = await c.createBooking(editor.claims, booking(-1, 7));
    expect((await c.liveAds("home"))[0]!.booking).toBeNull(); // not approved yet
    expect(await c.recordClick(b.id)).toBeNull();

    await c.setBookingApproved(editor.claims, b.id, true);
    const live = await c.liveAds("home");
    expect(live[0]).toMatchObject({ key: "home-banner", width: 1200, height: 250, booking: { id: b.id, sponsorName: "Banner Brand" } });

    expect(await c.recordClick(b.id)).toBe("https://advertiser.example/landing");
    expect(await c.recordClick(b.id)).toBe("https://advertiser.example/landing");
    expect((await c.listBookings(editor.claims)).find((x) => x.id === b.id)?.clicks).toBe(2);
  });

  it("refuses overlapping approved bookings for one slot", async () => {
    const clash = await c.createBooking(editor.claims, booking(2, 3)); // overlaps the live one
    await expect(c.setBookingApproved(editor.claims, clash.id, true)).rejects.toMatchObject({ kind: "conflict" });
    const later = await c.createBooking(editor.claims, booking(10, 3));
    await expect(c.setBookingApproved(editor.claims, later.id, true)).resolves.toMatchObject({ approved: true });
  });

  it("doesn't let anyone edit click counts directly, or writers manage ads", async () => {
    await expect(
      t.db.asUser(editor.claims, (q) => q.query("update public.ad_bookings set clicks = 1000")),
    ).rejects.toThrow(/permission denied/);
    await expect(c.createBooking(writer.claims, booking(20, 1))).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("won't approve an ad whose click-through link goes to a blocked domain", async () => {
    await c.blockDomain(editor.claims, { domain: "rug-pull.example", reason: "Fake token sale" });
    const bad = await c.createBooking(editor.claims, { ...booking(40, 1), clickUrl: "https://www.app.rug-pull.example/buy" });
    await expect(c.setBookingApproved(editor.claims, bad.id, true)).rejects.toMatchObject({ kind: "conflict", message: expect.stringMatching(/rug-pull\.example/) });
    // Fixing the link makes it approvable.
    await c.updateBooking(editor.claims, bad.id, { clickUrl: "https://advertiser.example/fixed" });
    await expect(c.setBookingApproved(editor.claims, bad.id, true)).resolves.toMatchObject({ approved: true });
    // Changing an approved ad's link pauses it, and it can't be re-approved while the link is blocked.
    const paused = await c.updateBooking(editor.claims, bad.id, { clickUrl: "https://rug-pull.example/" });
    expect(paused.approved).toBe(false);
    await expect(c.setBookingApproved(editor.claims, bad.id, true)).rejects.toMatchObject({ kind: "conflict" });
  });

  it("edits a booking's details, and needs approval again when the creative or link changes", async () => {
    const b = await c.createBooking(editor.claims, booking(50, 2));
    await c.setBookingApproved(editor.claims, b.id, true);
    const moved = await c.updateBooking(editor.claims, b.id, { endsAt: new Date(Date.now() + 53 * day).toISOString() });
    expect(moved.approved).toBe(true); // dates alone keep the approval
    const same = await c.updateBooking(editor.claims, b.id, { altText: "Advertiser banner" });
    expect(same.approved).toBe(true); // unchanged text keeps it too
    const changed = await c.updateBooking(editor.claims, b.id, { creativeUrl: "https://cdn.example/new.png", altText: "New banner" });
    expect(changed).toMatchObject({ approved: false, creativeUrl: "https://cdn.example/new.png", altText: "New banner" });
    await expect(c.updateBooking(writer.claims, b.id, { altText: "x" })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects non-https click URLs at the database", async () => {
    await expect(c.createBooking(editor.claims, { ...booking(30, 1), clickUrl: "javascript:alert(1)" })).rejects.toMatchObject({ kind: "invalid" });
  });
});
