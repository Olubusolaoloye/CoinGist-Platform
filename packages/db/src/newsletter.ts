import type {
  NewsletterList,
  Paginated,
  Subscriber,
  SubscriberStats,
  SubscriberStatus,
  SyncStatus,
} from "@coingist/types";
import { NEWSLETTER_LISTS, SUBSCRIBER_STATUSES } from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { mapDbError } from "./errors.js";

export type SignupOutcome = "created" | "resubscribed" | "lists-updated" | "unchanged";

/**
 * Newsletter data. Signups and provider sync run as the service role (readers can't touch the
 * subscribers table). Admin views run as the signed-in admin, so RLS still applies.
 */
export interface NewsletterRepository {
  recordSignup(input: { email: string; lists: NewsletterList[]; source: string }): Promise<{
    subscriber: Subscriber;
    outcome: SignupOutcome;
    /** True when the newsletter tool needs to hear about this signup. */
    needsSync: boolean;
  }>;
  markSynced(id: string, externalId: string, status: SubscriberStatus): Promise<void>;
  markSyncFailed(id: string, error: string): Promise<void>;
  pendingSync(limit: number, maxAttempts: number): Promise<Subscriber[]>;
  /** Status change reported by the newsletter tool (webhook). Returns false if unknown. */
  applyProviderStatus(ref: { externalId?: string | undefined; email?: string | undefined }, status: SubscriberStatus): Promise<boolean>;
  list(actor: SessionClaims, q: { status?: SubscriberStatus | undefined; syncStatus?: SyncStatus | undefined; page: number; pageSize: number }): Promise<Paginated<Subscriber>>;
  stats(actor: SessionClaims): Promise<SubscriberStats>;
  retryFailed(actor: SessionClaims): Promise<number>;
}

type Row = {
  id: string;
  email: string;
  lists: NewsletterList[];
  status: SubscriberStatus;
  source: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  sync_attempts: number;
  created_at: Date;
  confirmed_at: Date | null;
  unsubscribed_at: Date | null;
  updated_at: Date;
  total?: number;
};

const COLS = `id, email, lists, status, source, sync_status, sync_error, sync_attempts,
  created_at, confirmed_at, unsubscribed_at, updated_at`;
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const toSubscriber = (r: Row): Subscriber => ({
  id: r.id,
  email: r.email,
  lists: r.lists,
  status: r.status,
  source: r.source,
  syncStatus: r.sync_status,
  syncError: r.sync_error,
  syncAttempts: r.sync_attempts,
  createdAt: iso(r.created_at)!,
  confirmedAt: iso(r.confirmed_at),
  unsubscribedAt: iso(r.unsubscribed_at),
});

/** Re-submitting within this window doesn't re-trigger a confirmation email. */
const RESEND_COOLDOWN = "10 minutes";

export function createNewsletterRepository(db: Database): NewsletterRepository {
  const service = <T>(fn: (q: Queryable) => Promise<T>): Promise<T> => db.asService(fn).catch(mapDbError);

  return {
    recordSignup: ({ email, lists, source }) =>
      service(async (q) => {
        const existing = (
          await q.query<Row>(`select ${COLS} from public.subscribers where lower(email) = lower($1) for update`, [email])
        )[0];

        if (!existing) {
          const rows = await q.query<Row>(
            `insert into public.subscribers (email, lists, status, source, consented_at)
             values (lower($1), $2, 'pending', $3, now()) returning ${COLS}`,
            [email, lists, source],
          );
          return { subscriber: toSubscriber(rows[0]!), outcome: "created", needsSync: true };
        }

        if (existing.status === "unsubscribed" || existing.status === "bounced") {
          const rows = await q.query<Row>(
            `update public.subscribers set status = 'pending', lists = $2, source = $3, consented_at = now(),
               unsubscribed_at = null, sync_status = 'pending', sync_attempts = 0, sync_error = null,
               last_signup_at = now()
             where id = $1 returning ${COLS}`,
            [existing.id, lists, source],
          );
          return { subscriber: toSubscriber(rows[0]!), outcome: "resubscribed", needsSync: true };
        }

        const merged = [...new Set([...existing.lists, ...lists])].sort() as NewsletterList[];
        if (merged.length !== existing.lists.length) {
          const rows = await q.query<Row>(
            `update public.subscribers set lists = $2, sync_status = 'pending', sync_error = null,
               last_signup_at = now()
             where id = $1 returning ${COLS}`,
            [existing.id, merged],
          );
          return { subscriber: toSubscriber(rows[0]!), outcome: "lists-updated", needsSync: true };
        }

        // Same person, same lists. Re-sync only if a pending signup's email may have been lost,
        // and never more often than the cooldown (stops someone spamming a victim's inbox).
        const cool = await q.query<{ recent: boolean }>(
          `select last_signup_at > now() - interval '${RESEND_COOLDOWN}' as recent from public.subscribers where id = $1`,
          [existing.id],
        );
        const resend = existing.status === "pending" && !cool[0]?.recent;
        if (resend) {
          await q.query(
            "update public.subscribers set sync_status = 'pending', last_signup_at = now() where id = $1",
            [existing.id],
          );
        }
        return { subscriber: toSubscriber(existing), outcome: "unchanged", needsSync: resend };
      }),

    markSynced: (id, externalId, status) =>
      service(async (q) => {
        await q.query(
          `update public.subscribers set external_id = $2, sync_status = 'synced', sync_error = null,
             synced_at = now(), sync_attempts = sync_attempts + 1,
             status = case when status = 'pending' then $3::public.subscriber_status else status end,
             confirmed_at = case when $3 = 'active' and confirmed_at is null then now() else confirmed_at end
           where id = $1`,
          [id, externalId, status],
        );
      }),

    markSyncFailed: (id, error) =>
      service(async (q) => {
        await q.query(
          `update public.subscribers set sync_status = 'failed', sync_error = left($2, 500),
             sync_attempts = sync_attempts + 1 where id = $1`,
          [id, error],
        );
      }),

    pendingSync: (limit, maxAttempts) =>
      service(async (q) =>
        (
          await q.query<Row>(
            `select ${COLS} from public.subscribers
             where sync_status <> 'synced' and sync_attempts < $2 and status not in ('unsubscribed', 'bounced')
             order by created_at limit $1`,
            [limit, maxAttempts],
          )
        ).map(toSubscriber),
      ),

    applyProviderStatus: (ref, status) =>
      service(async (q) => {
        if (!ref.externalId && !ref.email) return false;
        const rows = await q.query(
          `update public.subscribers set status = $3::public.subscriber_status,
             confirmed_at = case when $3 = 'active' and confirmed_at is null then now() else confirmed_at end,
             unsubscribed_at = case when $3 in ('unsubscribed', 'bounced') then coalesce(unsubscribed_at, now()) else null end,
             external_id = coalesce(external_id, $1)
           where ($1::text is not null and external_id = $1)
              or ($2::text is not null and lower(email) = lower($2))
           returning id`,
          [ref.externalId ?? null, ref.email ?? null, status],
        );
        return rows.length > 0;
      }),

    list: (actor, { status, syncStatus, page, pageSize }) =>
      db
        .asUser(actor, async (q) => {
          const rows = await q.query<Row>(
            `select ${COLS}, count(*) over ()::int as total from public.subscribers
             where ($1::public.subscriber_status is null or status = $1)
               and ($2::public.sync_status is null or sync_status = $2)
             order by created_at desc limit $3 offset $4`,
            [status ?? null, syncStatus ?? null, pageSize, (page - 1) * pageSize],
          );
          return { items: rows.map(toSubscriber), page, pageSize, total: rows[0]?.total ?? 0 };
        })
        .catch(mapDbError),

    stats: (actor) =>
      db
        .asUser(actor, async (q) => {
          const byStatus = Object.fromEntries(SUBSCRIBER_STATUSES.map((s) => [s, 0])) as Record<SubscriberStatus, number>;
          for (const r of await q.query<{ status: SubscriberStatus; n: number }>(
            "select status, count(*)::int as n from public.subscribers group by status",
          )) byStatus[r.status] = r.n;

          const byList = Object.fromEntries(NEWSLETTER_LISTS.map((l) => [l, 0])) as Record<NewsletterList, number>;
          for (const r of await q.query<{ list: NewsletterList; n: number }>(
            `select l as list, count(*)::int as n from public.subscribers, unnest(lists) l
             where status in ('pending', 'active') group by l`,
          )) byList[r.list] = r.n;

          const misc = await q.query<{ failed: number; recent: number }>(
            `select count(*) filter (where sync_status = 'failed')::int as failed,
                    count(*) filter (where created_at > now() - interval '7 days')::int as recent
             from public.subscribers`,
          );
          return { byStatus, byList, failedSyncs: misc[0]?.failed ?? 0, last7Days: misc[0]?.recent ?? 0 };
        })
        .catch(mapDbError),

    retryFailed: (actor) =>
      db
        .asUser(actor, async (q) => {
          const rows = await q.query(
            `update public.subscribers set sync_status = 'pending', sync_attempts = 0
             where sync_status = 'failed' returning id`,
          );
          return rows.length;
        })
        .catch(mapDbError),
  };
}
