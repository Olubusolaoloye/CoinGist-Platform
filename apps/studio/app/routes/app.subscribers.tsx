import { data, Link, useFetcher, useSearchParams } from "react-router";
import {
  NEWSLETTER_LIST_INFO,
  NEWSLETTER_LISTS,
  SUBSCRIBER_STATUSES,
  type Paginated,
  type Subscriber,
  type SubscriberStats,
} from "@coingist/types";
import type { Route } from "./+types/app.subscribers";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Subscribers | CoinGist Studio" }];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
  active: "Active",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
};

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  for (const k of ["status", "sync", "page"]) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const [{ stats, provider }, list] = await Promise.all([
    api.get<{ stats: SubscriberStats; provider: string }>("/v1/admin/subscribers/stats"),
    api.get<Paginated<Subscriber>>(`/v1/admin/subscribers?${qs}`),
  ]);
  return data({ stats, provider, list }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const r = await studioApi(auth).post<{ requeued: number; attempted: number; synced: number }>("/v1/admin/subscribers/retry-failed");
  if (!r.ok) return data({ message: r.message }, { status: r.status, headers: auth.headers });
  const { attempted, synced } = r.data;
  const message =
    attempted === 0
      ? "Nothing to retry."
      : synced === attempted
        ? `Sent ${synced} subscriber${synced === 1 ? "" : "s"} to the newsletter tool.`
        : `Sent ${synced} of ${attempted}. The rest still failed; check the error column.`;
  return data({ message }, { headers: auth.headers });
}

export default function Subscribers({ loaderData }: Route.ComponentProps) {
  const { stats, provider, list } = loaderData;
  const [params] = useSearchParams();
  const retry = useFetcher<{ message: string }>();
  const filter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (v === null) next.delete(k);
    else next.set(k, v);
    return `?${next}`;
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`;
  const subscribed = stats.byStatus.active + stats.byStatus.pending;
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Subscribers</h1>
      <p className="mt-1 text-muted">
        Signups from the site. Sending happens in the newsletter tool ({provider}); confirmations and unsubscribes flow back here.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel">
          <dt className="text-sm text-muted">Subscribed</dt>
          <dd className="font-display text-3xl font-extrabold">{subscribed}</dd>
          <dd className="text-sm text-muted">{stats.byStatus.pending} awaiting confirmation</dd>
        </div>
        {NEWSLETTER_LISTS.map((l) => (
          <div key={l} className="panel">
            <dt className="text-sm text-muted">{NEWSLETTER_LIST_INFO[l].name}</dt>
            <dd className="font-display text-3xl font-extrabold">{stats.byList[l]}</dd>
            <dd className="text-sm text-muted">{NEWSLETTER_LIST_INFO[l].cadence}</dd>
          </div>
        ))}
        <div className="panel">
          <dt className="text-sm text-muted">New in the last 7 days</dt>
          <dd className="font-display text-3xl font-extrabold">{stats.last7Days}</dd>
          <dd className="text-sm text-muted">{stats.byStatus.unsubscribed} unsubscribed overall</dd>
        </div>
      </dl>

      {stats.failedSyncs > 0 ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-warn bg-surface p-3">
          <p>
            <strong>{stats.failedSyncs} signup{stats.failedSyncs === 1 ? "" : "s"}</strong> didn't reach the newsletter tool. They're retried
            automatically; you can also retry now.
          </p>
          <retry.Form method="post">
            <button className="btn" disabled={retry.state !== "idle"}>{retry.state !== "idle" ? "Retrying…" : "Retry now"}</button>
          </retry.Form>
          <Link to={filter("sync", "failed")} className="text-sm font-semibold text-link hover:underline">Show them</Link>
        </div>
      ) : null}
      {retry.data ? <p role="status" className="mt-2 text-sm">{retry.data.message}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Link to={filter("status", null)} className={pill(!params.get("status"))}>All</Link>
        {SUBSCRIBER_STATUSES.map((s) => (
          <Link key={s} to={filter("status", s)} className={pill(params.get("status") === s)}>{STATUS_LABEL[s]}</Link>
        ))}
        {params.get("sync") ? <Link to={filter("sync", null)} className={pill(true)}>Sync failed ✕</Link> : null}
      </div>

      {list.items.length === 0 ? (
        <p className="mt-6 panel">No subscribers match these filters.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Newsletters</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Signed up from</th>
                <th scope="col" className="px-4 py-3">Joined</th>
                <th scope="col" className="px-4 py-3">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.items.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-medium break-all">{s.email}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{STATUS_LABEL[s.status]}</td>
                  <td className="px-4 py-2">{s.lists.map((l) => NEWSLETTER_LIST_INFO[l]?.name ?? l).join(", ")}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.source ?? "unknown"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted">{formatWhen(s.createdAt)}</td>
                  <td className="px-4 py-2">
                    {s.syncStatus === "failed" ? (
                      <span className="text-bad" title={s.syncError ?? undefined}>Failed: {s.syncError}</span>
                    ) : s.syncStatus === "pending" ? (
                      <span className="text-warn">Waiting</span>
                    ) : (
                      <span className="text-ok">Synced</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          {list.page > 1 ? <Link className="btn" to={filter("page", String(list.page - 1))}>Previous</Link> : <span />}
          <span className="text-sm text-muted">Page {list.page} of {lastPage}</span>
          {list.page < lastPage ? <Link className="btn" to={filter("page", String(list.page + 1))}>Next</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
