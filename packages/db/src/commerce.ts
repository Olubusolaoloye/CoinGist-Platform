import type {
  AdBooking,
  AdBookingInput,
  AdSlot,
  BlockedDomain,
  BlockedLink,
  InvoiceStatus,
  OrderCreateInput,
  OrderUpdateInput,
  PostStatus,
  PublicAdSlot,
  Sponsor,
  SponsoredOrder,
  SponsoredOrderStatus,
  SponsorInput,
  VettingChecklist,
} from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";

/**
 * Sponsors, sponsored orders, link safety and ads. Studio calls run as the signed-in editor
 * (RLS: editors and admins); the public ad reads run as anon.
 */
export interface CommerceRepository {
  listSponsors(actor: SessionClaims): Promise<Sponsor[]>;
  createSponsor(actor: SessionClaims, input: SponsorInput): Promise<Sponsor>;
  updateSponsor(actor: SessionClaims, id: string, input: Partial<SponsorInput>): Promise<Sponsor>;

  listOrders(actor: SessionClaims, q: { status?: SponsoredOrderStatus | undefined }): Promise<SponsoredOrder[]>;
  getOrder(actor: SessionClaims, id: string): Promise<SponsoredOrder | null>;
  createOrder(actor: SessionClaims, input: OrderCreateInput): Promise<SponsoredOrder>;
  updateOrder(actor: SessionClaims, id: string, input: OrderUpdateInput): Promise<SponsoredOrder>;

  listBlockedDomains(actor: SessionClaims): Promise<BlockedDomain[]>;
  blockDomain(actor: SessionClaims, input: { domain: string; reason: string }): Promise<BlockedDomain>;
  unblockDomain(actor: SessionClaims, domain: string): Promise<void>;
  checkPostLinks(actor: SessionClaims, postId: string): Promise<BlockedLink[]>;

  listSlots(actor: SessionClaims): Promise<AdSlot[]>;
  listBookings(actor: SessionClaims): Promise<AdBooking[]>;
  createBooking(actor: SessionClaims, input: AdBookingInput): Promise<AdBooking>;
  setBookingApproved(actor: SessionClaims, id: string, approved: boolean): Promise<AdBooking>;
  deleteBooking(actor: SessionClaims, id: string): Promise<void>;

  /** Live ads for a placement (one per slot), for the public site. */
  liveAds(placement: string): Promise<PublicAdSlot[]>;
  /** Count a click; returns the sponsor's URL, or null if the booking isn't live. */
  recordClick(bookingId: string): Promise<string | null>;
}

const iso = (d: Date | string) => new Date(d).toISOString();

type SponsorRow = { id: string; name: string; website: string | null; contact_email: string | null; notes: string | null; created_at: Date };
const toSponsor = (r: SponsorRow): Sponsor => ({
  id: r.id,
  name: r.name,
  website: r.website,
  contactEmail: r.contact_email,
  notes: r.notes,
  createdAt: iso(r.created_at),
});

type OrderRow = {
  id: string; sponsor_id: string; sponsor_name: string; post_id: string | null; post_title: string | null;
  post_status: PostStatus | null; title: string; brief: string | null; amount: string | null; currency: string;
  vetting_checklist: VettingChecklist; status: SponsoredOrderStatus; invoice_status: InvoiceStatus;
  notes: string | null; created_at: Date; updated_at: Date;
};
const ORDER_SQL = `
  select o.id, o.sponsor_id, s.name as sponsor_name, o.post_id, p.title as post_title, p.status as post_status,
         o.title, o.brief, o.amount::text as amount, o.currency, o.vetting_checklist, o.status, o.invoice_status,
         o.notes, o.created_at, o.updated_at
  from public.sponsored_orders o
  join public.sponsors s on s.id = o.sponsor_id
  left join public.posts p on p.id = o.post_id`;
const toOrder = (r: OrderRow): SponsoredOrder => ({
  id: r.id,
  sponsor: { id: r.sponsor_id, name: r.sponsor_name },
  post: r.post_id ? { id: r.post_id, title: r.post_title ?? "", status: r.post_status! } : null,
  title: r.title,
  brief: r.brief,
  amount: r.amount,
  currency: r.currency,
  vettingChecklist: r.vetting_checklist,
  status: r.status,
  invoiceStatus: r.invoice_status,
  notes: r.notes,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

type BookingRow = {
  id: string; slot_key: string; slot_name: string; sponsor_id: string; sponsor_name: string;
  starts_at: Date; ends_at: Date; creative_url: string; click_url: string; alt_text: string; approved: boolean; clicks: number;
};
const BOOKING_SQL = `
  select b.id, sl.key as slot_key, sl.name as slot_name, b.sponsor_id, s.name as sponsor_name,
         b.starts_at, b.ends_at, b.creative_url, b.click_url, b.alt_text, b.approved, b.clicks
  from public.ad_bookings b
  join public.ad_slots sl on sl.id = b.slot_id
  join public.sponsors s on s.id = b.sponsor_id`;
const toBooking = (r: BookingRow): AdBooking => ({
  id: r.id,
  slot: { key: r.slot_key, name: r.slot_name },
  sponsor: { id: r.sponsor_id, name: r.sponsor_name },
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  creativeUrl: r.creative_url,
  clickUrl: r.click_url,
  altText: r.alt_text,
  approved: r.approved,
  clicks: r.clicks,
});

export function createCommerceRepository(db: Database): CommerceRepository {
  const as = <T>(actor: SessionClaims, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);
  const loadOrder = async (q: Queryable, id: string) => {
    const rows = await q.query<OrderRow>(`${ORDER_SQL} where o.id = $1`, [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  };
  const loadBooking = async (q: Queryable, id: string) => {
    const rows = await q.query<BookingRow>(`${BOOKING_SQL} where b.id = $1`, [id]);
    if (!rows[0]) throw new DomainError("not_found", "Booking not found");
    return toBooking(rows[0]);
  };
  /** A write that touched nothing: RLS hid the row (not found) or forbade it. */
  const requireRow = <T>(rows: T[], what: string) => {
    if (!rows.length) throw new DomainError("not_found", `${what} not found`);
    return rows[0]!;
  };

  return {
    listSponsors: (actor) =>
      as(actor, async (q) => (await q.query<SponsorRow>("select * from public.sponsors order by name")).map(toSponsor)),

    createSponsor: (actor, input) =>
      as(actor, async (q) => {
        const rows = await q.query<SponsorRow>(
          `insert into public.sponsors (name, website, contact_email, notes) values ($1, $2, $3, $4) returning *`,
          [input.name, input.website ?? null, input.contactEmail ?? null, input.notes ?? null],
        );
        return toSponsor(rows[0]!);
      }),

    updateSponsor: (actor, id, input) =>
      as(actor, async (q) => {
        const rows = await q.query<SponsorRow>(
          `update public.sponsors set
             name = coalesce($2, name),
             website = case when $3::boolean then $4 else website end,
             contact_email = case when $5::boolean then $6 else contact_email end,
             notes = case when $7::boolean then $8 else notes end
           where id = $1 returning *`,
          [id, input.name ?? null, input.website !== undefined, input.website ?? null,
           input.contactEmail !== undefined, input.contactEmail ?? null, input.notes !== undefined, input.notes ?? null],
        );
        return toSponsor(requireRow(rows, "Sponsor"));
      }),

    listOrders: (actor, { status }) =>
      as(actor, async (q) =>
        (await q.query<OrderRow>(`${ORDER_SQL} where ($1::public.sponsored_order_status is null or o.status = $1) order by o.updated_at desc`, [status ?? null])).map(toOrder),
      ),

    getOrder: (actor, id) => as(actor, (q) => loadOrder(q, id)),

    createOrder: (actor, input) =>
      as(actor, async (q) => {
        const rows = await q.query<{ id: string }>(
          `insert into public.sponsored_orders (sponsor_id, title, brief, amount, currency, created_by)
           values ($1, $2, $3, $4::numeric, $5, $6) returning id`,
          [input.sponsorId, input.title, input.brief ?? null, input.amount ?? null, input.currency, actor.sub],
        );
        return (await loadOrder(q, rows[0]!.id))!;
      }),

    updateOrder: (actor, id, input) =>
      as(actor, async (q) => {
        const sets: string[] = [];
        const params: unknown[] = [id];
        const set = (col: string, v: unknown, cast = "") => {
          params.push(v);
          sets.push(`${col} = $${params.length}${cast}`);
        };
        if (input.title !== undefined) set("title", input.title);
        if (input.brief !== undefined) set("brief", input.brief);
        if (input.amount !== undefined) set("amount", input.amount, "::numeric");
        if (input.currency !== undefined) set("currency", input.currency);
        if (input.invoiceStatus !== undefined) set("invoice_status", input.invoiceStatus, "::public.invoice_status");
        if (input.notes !== undefined) set("notes", input.notes);
        if (input.vettingChecklist !== undefined) {
          params.push(JSON.stringify(input.vettingChecklist));
          sets.push(`vetting_checklist = vetting_checklist || $${params.length}::jsonb`);
        }
        if (input.postId !== undefined) {
          if (input.postId) {
            // Only a sponsored post for this order's sponsor can be linked.
            const ok = await q.query(
              `select 1 from public.posts p join public.sponsored_orders o on o.id = $1
               where p.id = $2 and p.type = 'sponsored' and (p.sponsor_id is null or p.sponsor_id = o.sponsor_id)`,
              [id, input.postId],
            );
            if (!ok.length) throw new DomainError("invalid", "Link a sponsored story for this sponsor");
            await q.query("update public.posts set sponsor_id = (select sponsor_id from public.sponsored_orders where id = $1) where id = $2", [id, input.postId]);
          }
          set("post_id", input.postId);
        }
        // Status last, so a checklist change in the same request counts towards acceptance.
        if (sets.length) {
          requireRow(await q.query(`update public.sponsored_orders set ${sets.join(", ")} where id = $1 returning id`, params), "Order");
        }
        if (input.status !== undefined) {
          requireRow(
            await q.query("update public.sponsored_orders set status = $2::public.sponsored_order_status where id = $1 returning id", [id, input.status]),
            "Order",
          );
        }
        const order = await loadOrder(q, id);
        if (!order) throw new DomainError("not_found", "Order not found");
        return order;
      }),

    listBlockedDomains: (actor) =>
      as(actor, async (q) =>
        (await q.query<{ domain: string; reason: string; created_at: Date }>("select domain, reason, created_at from public.blocked_domains order by domain")).map((r) => ({
          domain: r.domain,
          reason: r.reason,
          createdAt: iso(r.created_at),
        })),
      ),

    blockDomain: (actor, { domain, reason }) =>
      as(actor, async (q) => {
        const rows = await q.query<{ domain: string; reason: string; created_at: Date }>(
          `insert into public.blocked_domains (domain, reason, added_by) values ($1, $2, $3)
           on conflict (domain) do update set reason = excluded.reason returning domain, reason, created_at`,
          [domain, reason, actor.sub],
        );
        const r = rows[0]!;
        return { domain: r.domain, reason: r.reason, createdAt: iso(r.created_at) };
      }),

    unblockDomain: (actor, domain) =>
      as(actor, async (q) => {
        requireRow(await q.query("delete from public.blocked_domains where domain = $1 returning domain", [domain]), "Domain");
      }),

    checkPostLinks: (actor, postId) =>
      as(actor, async (q) => {
        // Only staff who can see the post get an answer.
        const visible = await q.query("select 1 from public.posts where id = $1", [postId]);
        if (!visible.length) throw new DomainError("not_found", "Post not found");
        return q.query<BlockedLink>("select host, domain, reason from public.post_blocked_links($1)", [postId]);
      }),

    listSlots: (actor) =>
      as(actor, async (q) =>
        (await q.query<AdSlot>("select id, key, name, placement, width, height, active from public.ad_slots order by placement, key")),
      ),

    listBookings: (actor) =>
      as(actor, async (q) => (await q.query<BookingRow>(`${BOOKING_SQL} order by b.starts_at desc`)).map(toBooking)),

    createBooking: (actor, input) =>
      as(actor, async (q) => {
        const slot = await q.query<{ id: string }>("select id from public.ad_slots where key = $1", [input.slotKey]);
        if (!slot[0]) throw new DomainError("invalid", `Unknown ad slot: ${input.slotKey}`);
        const rows = await q.query<{ id: string }>(
          `insert into public.ad_bookings (slot_id, sponsor_id, starts_at, ends_at, creative_url, click_url, alt_text)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [slot[0].id, input.sponsorId, input.startsAt, input.endsAt, input.creativeUrl, input.clickUrl, input.altText],
        );
        return loadBooking(q, rows[0]!.id);
      }),

    setBookingApproved: (actor, id, approved) =>
      as(actor, async (q) => {
        requireRow(await q.query("update public.ad_bookings set approved = $2 where id = $1 returning id", [id, approved]), "Booking");
        return loadBooking(q, id);
      }),

    deleteBooking: (actor, id) =>
      as(actor, async (q) => {
        requireRow(await q.query("delete from public.ad_bookings where id = $1 returning id", [id]), "Booking");
      }),

    liveAds: (placement) =>
      db
        .asUser(null, async (q) => {
          const rows = await q.query<{
            key: string; width: number; height: number; booking_id: string | null;
            creative_url: string | null; alt_text: string | null; sponsor_name: string | null;
          }>(
            `select sl.key, sl.width, sl.height, b.id as booking_id, b.creative_url, b.alt_text, sd.name as sponsor_name
             from public.ad_slots sl
             left join lateral (
               select * from public.ad_bookings b
               where b.slot_id = sl.id order by b.starts_at limit 1
             ) b on true
             left join public.sponsor_directory sd on sd.id = b.sponsor_id
             where sl.placement = $1
             order by sl.key`,
            [placement],
          );
          return rows.map((r) => ({
            key: r.key,
            width: r.width,
            height: r.height,
            booking:
              r.booking_id && r.creative_url && r.sponsor_name
                ? { id: r.booking_id, creativeUrl: r.creative_url, altText: r.alt_text ?? "", sponsorName: r.sponsor_name }
                : null,
          }));
        })
        .catch(mapDbError),

    recordClick: (bookingId) =>
      db
        .asUser(null, async (q) => {
          const rows = await q.query<{ url: string | null }>("select public.record_ad_click($1) as url", [bookingId]);
          return rows[0]?.url ?? null;
        })
        .catch(mapDbError),
  };
}
