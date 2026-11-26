import {
  POST_STATUSES,
  ROLES,
  type AdminDashboard,
  type CalendarDay,
  type CalendarEntry,
  type EditorDashboard,
  type PaymentCreateInput,
  type PaymentStatus,
  type PaymentUpdateInput,
  type PayoutTotal,
  type PostStatus,
  type PostType,
  type Role,
  type UnpaidStory,
  type WriterEarnings,
  type WriterPayment,
} from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";
import { STUDIO_SUMMARY_SQL, toStudioSummary, type StudioSummaryRow } from "./studio.js";

/**
 * Dashboards and writer payouts. Every call runs as the signed-in staff member, so RLS decides
 * what they can see (editors see every story; only admins see payments and the audit log).
 */
export interface InsightsRepository {
  editorDashboard(actor: SessionClaims, opts: { from?: string | undefined; now?: Date }): Promise<EditorDashboard>;
  adminDashboard(actor: SessionClaims): Promise<AdminDashboard>;

  listPayments(actor: SessionClaims, q: { status?: PaymentStatus | undefined }): Promise<WriterPayment[]>;
  unpaidStories(actor: SessionClaims): Promise<UnpaidStory[]>;
  createPayment(actor: SessionClaims, input: PaymentCreateInput): Promise<WriterPayment>;
  updatePayment(actor: SessionClaims, id: string, input: PaymentUpdateInput): Promise<WriterPayment>;
  myEarnings(actor: SessionClaims): Promise<WriterEarnings>;
}

const iso = (d: Date | string) => new Date(d).toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Monday (UTC) of the week containing `d`. */
export function weekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)));
}

const CALENDAR_DAYS = 14;

type PaymentRow = {
  id: string; writer_id: string; writer_name: string | null; post_id: string | null; post_title: string | null;
  amount: string; currency: string; status: PaymentStatus; note: string | null; paid_at: Date | null; created_at: Date;
};
const PAYMENT_SQL = `
  select w.id, w.writer_id, u.name as writer_name, w.post_id, p.title as post_title,
         w.amount::text as amount, w.currency, w.status, w.note, w.paid_at, w.created_at
  from public.writer_payments w
  left join public.users u on u.id = w.writer_id
  left join public.posts p on p.id = w.post_id`;
const toPayment = (r: PaymentRow): WriterPayment => ({
  id: r.id,
  writer: { id: r.writer_id, name: r.writer_name },
  post: r.post_id ? { id: r.post_id, title: r.post_title ?? "" } : null,
  amount: r.amount,
  currency: r.currency,
  status: r.status,
  note: r.note,
  paidAt: r.paid_at ? iso(r.paid_at) : null,
  createdAt: iso(r.created_at),
});

const TOTALS_SQL = (where: string) => `
  select status, currency, sum(amount)::numeric(14,2)::text as amount, count(*)::int as count
  from public.writer_payments ${where}
  group by status, currency order by status, currency`;

/** Unique-index violation on "one payment per story" → a message people can act on. */
const friendlyPaymentError = (err: unknown): never => {
  const e = err as { code?: string; message?: string };
  if (e.code === "23505" && /writer_payments_one_per_post/.test(e.message ?? "")) {
    throw new DomainError("conflict", "That story already has a payment. Cancel it first to record a new one.");
  }
  return mapDbError(err);
};

export function createInsightsRepository(db: Database): InsightsRepository {
  const as = <T>(actor: SessionClaims, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);
  const loadPayment = async (q: Queryable, id: string) => {
    const rows = await q.query<PaymentRow>(`${PAYMENT_SQL} where w.id = $1`, [id]);
    if (!rows[0]) throw new DomainError("not_found", "Payment not found");
    return toPayment(rows[0]);
  };

  return {
    editorDashboard: (actor, { from, now = new Date() }) =>
      as(actor, async (q) => {
        const start = from ?? weekStart(now);
        const summaries = (where: string, order: string) =>
          `(select coalesce(json_agg(x), '[]'::json) from (${STUDIO_SUMMARY_SQL} where ${where} order by ${order} limit 8) x)`;

        // Everything in one statement: one round trip to the database instead of nine.
        // $1 = the editor, $2 = now, $3 = calendar start, $4 = calendar length in days.
        const [row] = await q.query<{
          counts: Array<{ status: PostStatus; n: number }>;
          review_queue: StudioSummaryRow[];
          ready_to_schedule: StudioSummaryRow[];
          stalled: StudioSummaryRow[];
          entries: Array<{
            id: string; title: string; type: PostType; status: "scheduled" | "published"; at: string;
            author_id: string; author_name: string | null;
          }>;
          published_by_day: Array<{ date: string; count: number }>;
          section_mix: Array<{ type: PostType; count: number }>;
          writers: Array<{
            id: string; name: string | null; role: Role; drafts: number; in_review: number;
            changes_requested: number; published_30d: number; last_active_at: string | null;
          }>;
        }>(
          `select
             (select coalesce(json_agg(c), '[]'::json)
                from (select status, count(*)::int as n from public.posts group by status) c) as counts,
             ${summaries("p.status = 'in_review' and p.author_id <> $1", "p.updated_at asc")} as review_queue,
             ${summaries("p.status = 'approved'", "p.approved_at asc nulls last")} as ready_to_schedule,
             ${summaries(
               "p.status in ('draft', 'changes_requested') and p.updated_at < $2::timestamptz - interval '7 days'",
               "p.updated_at asc",
             )} as stalled,
             (select coalesce(json_agg(e order by e.at), '[]'::json) from (
                select p.id, p.title, p.type, p.status,
                       case when p.status = 'scheduled' then p.scheduled_for else p.published_at end as at,
                       p.author_id, u.name as author_name
                from public.posts p left join public.users u on u.id = p.author_id
                where (p.status = 'scheduled' and p.scheduled_for >= $3::date and p.scheduled_for < $3::date + $4::int)
                   or (p.status = 'published' and p.published_at >= $3::date and p.published_at < $3::date + $4::int)
             ) e) as entries,
             (select coalesce(json_agg(d order by d.date), '[]'::json) from (
                select to_char(d, 'YYYY-MM-DD') as date, count(p.id)::int as count
                from generate_series(($2::timestamptz at time zone 'UTC')::date - 29,
                                     ($2::timestamptz at time zone 'UTC')::date, interval '1 day') d
                left join public.posts p
                  on p.status = 'published' and (p.published_at at time zone 'UTC')::date = d::date
                group by d
             ) d) as published_by_day,
             (select coalesce(json_agg(m order by m.count desc, m.type), '[]'::json) from (
                select type, count(*)::int as count from public.posts
                where status = 'published' and published_at >= $2::timestamptz - interval '30 days'
                group by type
             ) m) as section_mix,
             (select coalesce(json_agg(w order by w.published_30d desc, w.last_active_at desc nulls last, w.name), '[]'::json) from (
                select u.id, u.name, u.role,
                       count(p.id) filter (where p.status = 'draft')::int as drafts,
                       count(p.id) filter (where p.status = 'in_review')::int as in_review,
                       count(p.id) filter (where p.status = 'changes_requested')::int as changes_requested,
                       count(p.id) filter (where p.status = 'published'
                         and p.published_at >= $2::timestamptz - interval '30 days')::int as published_30d,
                       max(p.updated_at) as last_active_at
                from public.users u
                left join public.posts p on p.author_id = u.id
                where u.role in ('writer', 'editor', 'admin') and u.status = 'active'
                group by u.id
                having count(p.id) > 0 or u.role = 'writer'
             ) w) as writers`,
          [actor.sub, now.toISOString(), start, CALENDAR_DAYS],
        );
        const r = row!;

        const counts = Object.fromEntries(POST_STATUSES.map((st) => [st, 0])) as Record<PostStatus, number>;
        for (const c of r.counts) counts[c.status] = c.n;

        const days: CalendarDay[] = Array.from({ length: CALENDAR_DAYS }, (_, i) => ({
          date: ymd(new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000)),
          entries: [] as CalendarEntry[],
        }));
        for (const e of r.entries) {
          const day = days.find((d) => d.date === ymd(new Date(e.at)));
          day?.entries.push({
            id: e.id, title: e.title, type: e.type, status: e.status, at: iso(e.at),
            author: { id: e.author_id, name: e.author_name },
          });
        }

        return {
          counts,
          reviewQueue: r.review_queue.map(toStudioSummary),
          readyToSchedule: r.ready_to_schedule.map(toStudioSummary),
          stalled: r.stalled.map(toStudioSummary),
          calendar: { from: start, days },
          publishedByDay: r.published_by_day,
          sectionMix: r.section_mix,
          writers: r.writers.map((w) => ({
            id: w.id, name: w.name, role: w.role, drafts: w.drafts, inReview: w.in_review,
            changesRequested: w.changes_requested, published30d: w.published_30d,
            lastActiveAt: w.last_active_at ? iso(w.last_active_at) : null,
          })),
        };
      }),

    adminDashboard: (actor) =>
      as(actor, async (q) => {
        const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
        let suspended = 0;
        for (const r of await q.query<{ role: Role; status: string; n: number }>(
          "select role, status, count(*)::int as n from public.users where status <> 'deleted' group by role, status",
        )) {
          if (r.status === "suspended") suspended += r.n;
          else byRole[r.role] += r.n;
        }
        const staffWithout2fa = await q.query<{ id: string; name: string | null; email: string; role: Role }>(
          `select id, name, email, role from public.users
           where role in ('writer', 'editor', 'admin') and status = 'active' and not two_factor_enabled
           order by name nulls last, email`,
        );

        const [pub] = await q.query<{ published_30d: number; in_review: number; scheduled: number }>(
          `select count(*) filter (where status = 'published' and published_at >= now() - interval '30 days')::int as published_30d,
                  count(*) filter (where status = 'in_review')::int as in_review,
                  count(*) filter (where status = 'scheduled')::int as scheduled
           from public.posts`,
        );

        const totals = await q.query<PayoutTotal>(TOTALS_SQL("where status <> 'cancelled'"));
        const [unpaid] = await q.query<{ n: number }>(
          `select count(*)::int as n from public.posts p join public.users u on u.id = p.author_id
           where p.status = 'published' and u.role in ('writer', 'editor', 'admin')
             and p.published_at >= now() - interval '180 days'
             and not exists (select 1 from public.writer_payments w where w.post_id = p.id and w.status <> 'cancelled')`,
        );

        const orders = await q.query<AdminDashboard["sponsorship"]["orders"][number]>(
          `select status, currency, coalesce(sum(amount), 0)::numeric(14,2)::text as amount, count(*)::int as count
           from public.sponsored_orders group by status, currency order by status, currency`,
        );
        const outstanding = await q.query<AdminDashboard["sponsorship"]["outstanding"][number]>(
          `select invoice_status as status, currency, coalesce(sum(amount), 0)::numeric(14,2)::text as amount, count(*)::int as count
           from public.sponsored_orders where invoice_status in ('sent', 'overdue')
           group by invoice_status, currency order by invoice_status desc, currency`,
        );

        const [ads] = await q.query<{ live: number; live_clicks: number; awaiting: number }>(
          `select count(*) filter (where approved and now() >= starts_at and now() < ends_at)::int as live,
                  coalesce(sum(clicks) filter (where approved and now() >= starts_at and now() < ends_at), 0)::int as live_clicks,
                  count(*) filter (where not approved and ends_at > now())::int as awaiting
           from public.ad_bookings`,
        );

        const activity = await q.query<{
          id: string; action: string; entity: string; entity_id: string | null; actor_name: string | null; created_at: Date;
        }>(
          `select a.id, a.action, a.entity, a.entity_id, coalesce(u.name, u.email) as actor_name, a.created_at
           from public.audit_logs a left join public.users u on u.id = a.actor_id
           order by a.created_at desc limit 12`,
        );

        return {
          team: { byRole, suspended, staffWithout2fa },
          publishing: { published30d: pub!.published_30d, inReview: pub!.in_review, scheduled: pub!.scheduled },
          payouts: { totals, unpaidStories: unpaid!.n },
          sponsorship: { orders, outstanding },
          ads: { live: ads!.live, liveClicks: ads!.live_clicks, awaitingApproval: ads!.awaiting },
          recentActivity: activity.map((a) => ({
            id: a.id, action: a.action, entity: a.entity, entityId: a.entity_id,
            actorName: a.actor_name, createdAt: iso(a.created_at),
          })),
        };
      }),

    listPayments: (actor, { status }) =>
      as(actor, async (q) =>
        (
          await q.query<PaymentRow>(
            `${PAYMENT_SQL} where ($1::public.payment_status is null or w.status = $1)
             order by case w.status when 'pending' then 0 when 'approved' then 1 else 2 end, w.created_at desc
             limit 200`,
            [status ?? null],
          )
        ).map(toPayment),
      ),

    unpaidStories: (actor) =>
      as(actor, async (q) =>
        (
          await q.query<{ id: string; title: string; type: PostType; published_at: Date; author_id: string; author_name: string | null }>(
            `select p.id, p.title, p.type, p.published_at, p.author_id, u.name as author_name
             from public.posts p join public.users u on u.id = p.author_id
             where p.status = 'published' and u.role in ('writer', 'editor', 'admin')
               and p.published_at >= now() - interval '180 days'
               and not exists (select 1 from public.writer_payments w where w.post_id = p.id and w.status <> 'cancelled')
             order by p.published_at desc limit 100`,
          )
        ).map((r) => ({
          id: r.id, title: r.title, type: r.type, publishedAt: iso(r.published_at),
          writer: { id: r.author_id, name: r.author_name },
        })),
      ),

    createPayment: (actor, input) =>
      db
        .asUser(actor, async (q) => {
          const rows = await q.query<{ id: string }>(
            `insert into public.writer_payments (writer_id, post_id, amount, currency, note)
             values ($1, $2, $3::numeric, $4, $5) returning id`,
            [input.writerId, input.postId, input.amount, input.currency, input.note || null],
          );
          return loadPayment(q, rows[0]!.id);
        })
        .catch(friendlyPaymentError),

    updatePayment: (actor, id, { status }) =>
      db
        .asUser(actor, async (q) => {
          const rows = await q.query<{ id: string }>(
            "update public.writer_payments set status = $2::public.payment_status where id = $1 returning id",
            [id, status],
          );
          if (!rows[0]) throw new DomainError("not_found", "Payment not found");
          return loadPayment(q, id);
        })
        .catch(friendlyPaymentError),

    myEarnings: (actor) =>
      as(actor, async (q) => {
        const payments = (
          await q.query<PaymentRow>(`${PAYMENT_SQL} where w.writer_id = $1 order by w.created_at desc limit 200`, [actor.sub])
        ).map(toPayment);
        const totals = await q.query<PayoutTotal>(TOTALS_SQL("where writer_id = $1 and status <> 'cancelled'"), [actor.sub]);
        const [pub] = await q.query<{ d30: number; total: number }>(
          `select count(*) filter (where published_at >= now() - interval '30 days')::int as d30, count(*)::int as total
           from public.posts where author_id = $1 and status = 'published'`,
          [actor.sub],
        );
        return { payments, totals, published30d: pub!.d30, publishedAllTime: pub!.total };
      }),
  };
}
