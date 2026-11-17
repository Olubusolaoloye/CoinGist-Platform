import { data, Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { SPONSORED_ORDER_STATUSES, type Sponsor, type SponsoredOrder, type SponsoredOrderStatus } from "@coingist/types";
import type { Route } from "./+types/app.sponsored";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Sponsored | CoinGist Studio" }];
}

export const ORDER_STATUS_LABEL: Record<SponsoredOrderStatus, string> = {
  inquiry: "Inquiry",
  vetting: "Vetting",
  rejected: "Rejected",
  accepted: "Accepted",
  in_production: "In production",
  published: "Published",
};

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const status = new URL(request.url).searchParams.get("status");
  const qs = status && (SPONSORED_ORDER_STATUSES as readonly string[]).includes(status) ? `?status=${status}` : "";
  const [{ orders }, { sponsors }] = await Promise.all([
    api.get<{ orders: SponsoredOrder[] }>(`/v1/studio/orders${qs}`),
    api.get<{ sponsors: Sponsor[] }>("/v1/studio/sponsors"),
  ]);
  return data({ orders, sponsors }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  if (form.get("intent") === "sponsor") {
    const r = await api.post("/v1/studio/sponsors", {
      name: String(form.get("name") ?? ""),
      website: String(form.get("website") ?? ""),
      contactEmail: String(form.get("contactEmail") ?? ""),
    });
    return r.ok
      ? data({ ok: true, form: "sponsor", error: null as string | null })
      : data({ ok: false, form: "sponsor", error: r.message as string | null }, { status: r.status });
  }
  const r = await api.post<{ order: SponsoredOrder }>("/v1/studio/orders", {
    sponsorId: String(form.get("sponsorId") ?? ""),
    title: String(form.get("title") ?? ""),
    amount: String(form.get("amount") ?? ""),
    currency: String(form.get("currency") ?? "USD"),
  });
  if (!r.ok) return data({ ok: false, form: "order", error: r.message as string | null }, { status: r.status });
  return redirect(`/sponsored/${r.data.order.id}`, { headers: auth.headers });
}

export default function Sponsored({ loaderData, actionData }: Route.ComponentProps) {
  const { orders, sponsors } = loaderData;
  const [params] = useSearchParams();
  const busy = useNavigation().state !== "idle";
  const status = params.get("status") ?? "";
  const pill = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`;
  const err = (f: string) => (actionData && !actionData.ok && actionData.form === f ? <p role="alert" className="text-sm text-bad">{actionData.error}</p> : null);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold">Sponsored orders</h1>
        <p className="mt-1 text-muted">Paid stories from inquiry to publication. A sponsored story can't be approved until its order is accepted, and an order can't be accepted until vetting is complete.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <Link to="?" className={pill(!status)}>All</Link>
          {SPONSORED_ORDER_STATUSES.map((s) => <Link key={s} to={`?status=${s}`} className={pill(status === s)}>{ORDER_STATUS_LABEL[s]}</Link>)}
        </div>
        {orders.length === 0 ? (
          <p className="mt-6 panel">No orders here yet. Start one with the form on this page.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Order</th>
                  <th scope="col" className="px-4 py-3">Sponsor</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">Amount</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">Story</th>
                  <th scope="col" className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3"><Link to={`/sponsored/${o.id}`} className="font-semibold hover:underline">{o.title}</Link></td>
                    <td className="px-4 py-3">{o.sponsor.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{ORDER_STATUS_LABEL[o.status]}</td>
                    <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">{o.amount ? `${o.currency} ${o.amount}` : "Not set"}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{o.post ? o.post.title : <span className="text-muted">Not linked</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(o.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <section aria-labelledby="new-order" className="panel space-y-3">
          <h2 id="new-order" className="font-display text-lg font-extrabold">New order</h2>
          {sponsors.length === 0 ? (
            <p className="text-sm text-muted">Add a sponsor first.</p>
          ) : (
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="order" />
              <div><label htmlFor="sponsorId" className="label">Sponsor</label>
                <select id="sponsorId" name="sponsorId" className="field" required>{sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label htmlFor="title" className="label">What they're buying</label><input id="title" name="title" required maxLength={200} className="field" placeholder="e.g. Launch explainer, March" /></div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div><label htmlFor="amount" className="label">Price</label><input id="amount" name="amount" inputMode="decimal" className="field" placeholder="1500" /></div>
                <div><label htmlFor="currency" className="label">Currency</label><input id="currency" name="currency" defaultValue="USD" maxLength={3} className="field uppercase" /></div>
              </div>
              {err("order")}
              <button className="btn btn-primary w-full" disabled={busy}>Create order</button>
            </Form>
          )}
        </section>

        <section aria-labelledby="sponsors-h" className="panel space-y-3">
          <h2 id="sponsors-h" className="font-display text-lg font-extrabold">Sponsors</h2>
          <ul className="space-y-1 text-sm">
            {sponsors.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.name}</span>
                {s.website ? <span className="text-muted"> {s.website.replace(/^https:\/\//, "")}</span> : null}
              </li>
            ))}
          </ul>
          <Form method="post" className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="intent" value="sponsor" />
            <div><label htmlFor="name" className="label">Add a sponsor</label><input id="name" name="name" required maxLength={200} className="field" placeholder="Company name" /></div>
            <div><label htmlFor="website" className="sr-only">Website</label><input id="website" name="website" className="field" placeholder="https://company.example" /></div>
            <div><label htmlFor="contactEmail" className="sr-only">Contact email</label><input id="contactEmail" name="contactEmail" type="email" className="field" placeholder="Contact email" /></div>
            {err("sponsor")}
            {actionData?.ok && actionData.form === "sponsor" ? <p role="status" className="text-sm text-ok">Sponsor added.</p> : null}
            <button className="btn w-full" disabled={busy}>Add sponsor</button>
          </Form>
        </section>
      </aside>
    </main>
  );
}
