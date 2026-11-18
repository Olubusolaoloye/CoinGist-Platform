import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import { PAYMENT_STATUSES, type PaymentStatus, type UnpaidStory, type User, type WriterPayment } from "@coingist/types";
import type { Route } from "./+types/app.admin.payouts";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatMoney, formatShortDate, sumByCurrency } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";
import { PAYMENT_LABEL } from "~/lib/payments";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Payouts | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const status = new URL(request.url).searchParams.get("status");
  const qs = status && (PAYMENT_STATUSES as readonly string[]).includes(status) ? `?status=${status}` : "";
  const [{ payments }, { stories }, { users }] = await Promise.all([
    api.get<{ payments: WriterPayment[] }>(`/v1/admin/payments${qs}`),
    api.get<{ stories: UnpaidStory[] }>("/v1/admin/payments/unpaid-stories"),
    api.get<{ users: User[] }>("/v1/admin/users?limit=100"),
  ]);
  const rank = { writer: 0, editor: 1, admin: 2, reader: 3 } as const;
  const writers = users
    .filter((u) => u.role !== "reader" && u.status === "active")
    .sort((a, b) => rank[a.role] - rank[b.role] || (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return data({ payments, stories, writers }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  const r =
    intent === "approved" || intent === "paid" || intent === "cancelled"
      ? await api.patch(`/v1/admin/payments/${id}`, { status: intent })
      : await api.post("/v1/admin/payments", {
          writerId: form.get("writerId"),
          postId: form.get("postId") || null,
          amount: String(form.get("amount") ?? ""),
          currency: String(form.get("currency") ?? "USD"),
          note: String(form.get("note") ?? "") || null,
        });
  if (!r.ok) return data({ error: r.message, message: null }, { status: r.status, headers: auth.headers });
  const message =
    intent === "approved" ? "Payment approved." : intent === "paid" ? "Marked as paid." : intent === "cancelled" ? "Payment cancelled." : "Payment recorded. Approve it when you're ready to pay.";
  return data({ error: null, message }, { headers: auth.headers });
}

const NEXT: Partial<Record<PaymentStatus, Array<{ to: "approved" | "paid" | "cancelled"; label: string }>>> = {
  pending: [{ to: "approved", label: "Approve" }, { to: "cancelled", label: "Cancel" }],
  approved: [{ to: "paid", label: "Mark paid" }, { to: "cancelled", label: "Cancel" }],
};

export default function Payouts({ loaderData, actionData }: Route.ComponentProps) {
  const { payments, stories, writers } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [params] = useSearchParams();
  const status = params.get("status");
  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`;
  const owed = payments.filter((p) => p.status === "pending" || p.status === "approved");

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <p className="text-sm"><Link to="/admin" className="text-link hover:underline">Admin</Link> /</p>
        <h1 className="font-display text-3xl font-extrabold">Writer payouts</h1>
        <p className="mt-1 text-muted">
          Record a payment, approve it, then mark it paid once the money has gone out. Paid is final; amounts lock on approval. Each story can be paid once.
        </p>

        <div role="status" className="mt-3 min-h-6 text-sm">{actionData?.message ? <p className="text-ok">{actionData.message}</p> : null}</div>
        {actionData?.error ? <p role="alert" className="rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}

        <nav aria-label="Filter by status" className="mt-2 flex flex-wrap gap-2">
          <Link to="?" className={pill(!status)}>All</Link>
          {PAYMENT_STATUSES.map((s) => <Link key={s} to={`?status=${s}`} className={pill(status === s)}>{PAYMENT_LABEL[s]}</Link>)}
        </nav>
        {owed.length ? <p className="mt-3 text-sm">Owed in this view: <strong>{sumByCurrency(owed)}</strong></p> : null}

        {payments.length === 0 ? (
          <p className="panel mt-4 text-sm text-muted">No payments{status ? " with this status" : " yet"}.</p>
        ) : (
          <div className="panel mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">Writer and story</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-4 py-2 font-normal">
                      <span className="block font-semibold">{p.writer.name ?? "Unnamed"}</span>
                      <span className="text-muted">
                        {p.post ? <Link to={`/posts/${p.post.id}`} className="hover:underline">{p.post.title}</Link> : "Not tied to a story"}
                        {p.note ? ` · ${p.note}` : ""} · Recorded {formatShortDate(p.createdAt)}
                      </span>
                    </th>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className={`px-4 py-2 ${p.status === "paid" ? "text-ok" : p.status === "cancelled" ? "text-muted" : p.status === "approved" ? "font-semibold" : ""}`}>
                      {PAYMENT_LABEL[p.status]}{p.paidAt ? ` ${formatShortDate(p.paidAt)}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {(NEXT[p.status] ?? []).map((a) => (
                        <Form
                          key={a.to}
                          method="post"
                          className="ml-3 inline"
                          onSubmit={(e) => {
                            const ask = a.to === "paid" ? `Mark ${formatMoney(p.amount, p.currency)} to ${p.writer.name ?? "this writer"} as paid? This can't be undone.` : a.to === "cancelled" ? "Cancel this payment?" : null;
                            if (ask && !window.confirm(ask)) e.preventDefault();
                          }}
                        >
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            name="intent"
                            value={a.to}
                            disabled={busy}
                            className={`font-semibold hover:underline ${a.to === "cancelled" ? "text-bad" : "text-link"}`}
                            aria-label={`${a.label}: ${p.writer.name ?? "writer"}, ${formatMoney(p.amount, p.currency)}`}
                          >
                            {a.label}
                          </button>
                        </Form>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="space-y-6">
        <section aria-labelledby="unpaid-h" className="panel">
          <h2 id="unpaid-h" className="font-display text-lg font-extrabold">Published, not yet paid</h2>
          <p className="text-sm text-muted">Stories from the last six months with no payment.</p>
          {stories.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Every published story has a payment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {stories.map((s) => (
                <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted">{s.writer.name ?? "Unnamed"} · <span className="capitalize">{s.type}</span> · {formatShortDate(s.publishedAt)}</p>
                  <Form method="post" className="mt-2 flex items-end gap-2">
                    <input type="hidden" name="intent" value="create" />
                    <input type="hidden" name="writerId" value={s.writer.id} />
                    <input type="hidden" name="postId" value={s.id} />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`amt-${s.id}`} className="sr-only">Amount for "{s.title}"</label>
                      <input id={`amt-${s.id}`} name="amount" inputMode="decimal" required placeholder="Amount" className="field py-1" />
                    </div>
                    <div className="w-20">
                      <label htmlFor={`cur-${s.id}`} className="sr-only">Currency for "{s.title}"</label>
                      <input id={`cur-${s.id}`} name="currency" defaultValue="USD" maxLength={3} required className="field py-1 uppercase" />
                    </div>
                    <button className="btn py-1" disabled={busy} aria-label={`Record payment for "${s.title}"`}>Record</button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="other-h" className="panel">
          <h2 id="other-h" className="font-display text-lg font-extrabold">Other payment</h2>
          <p className="text-sm text-muted">A bonus, expenses or a fee not tied to one story.</p>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="create" />
            <div>
              <label htmlFor="writerId" className="label">Writer</label>
              <select id="writerId" name="writerId" required className="field">
                {writers.map((w) => <option key={w.id} value={w.id}>{w.name ?? w.email}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
              <div><label htmlFor="amount" className="label">Amount</label><input id="amount" name="amount" inputMode="decimal" required className="field" placeholder="150.00" /></div>
              <div><label htmlFor="currency" className="label">Currency</label><input id="currency" name="currency" defaultValue="USD" maxLength={3} required className="field uppercase" /></div>
            </div>
            <div><label htmlFor="note" className="label">Note</label><input id="note" name="note" maxLength={500} required className="field" placeholder="What it's for" /></div>
            <button className="btn btn-primary w-full" disabled={busy}>Record payment</button>
          </Form>
        </section>
      </aside>
    </main>
  );
}
