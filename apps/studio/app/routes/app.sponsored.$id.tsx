import { data, Form, Link, useNavigation } from "react-router";
import {
  INVOICE_STATUSES,
  ORDER_TRANSITIONS,
  VETTING_ITEMS,
  vettingComplete,
  type Paginated,
  type SponsoredOrder,
  type StudioPostSummary,
} from "@coingist/types";
import type { Route } from "./+types/app.sponsored.$id";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { studioHeaders } from "~/lib/headers";
import { ORDER_STATUS_LABEL } from "./app.sponsored";

export const headers = studioHeaders;
export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.order.title ?? "Order"} | CoinGist Studio` }];
}

const INVOICE_LABEL: Record<string, string> = { none: "Not invoiced", sent: "Invoice sent", paid: "Paid", overdue: "Overdue", void: "Void" };

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const [{ order }, posts] = await Promise.all([
    api.get<{ order: SponsoredOrder }>(`/v1/studio/orders/${params.id}`),
    api.get<Paginated<StudioPostSummary>>("/v1/studio/posts?pageSize=100"),
  ]);
  return data({ order, sponsoredPosts: posts.items.filter((p) => p.type === "sponsored") }, { headers: auth.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const form = await request.formData();
  const body: Record<string, unknown> = {};
  if (form.get("intent") === "status") body["status"] = form.get("status");
  else {
    body["title"] = String(form.get("title") ?? "");
    body["brief"] = String(form.get("brief") ?? "");
    body["amount"] = String(form.get("amount") ?? "");
    body["currency"] = String(form.get("currency") ?? "USD");
    body["invoiceStatus"] = form.get("invoiceStatus");
    body["notes"] = String(form.get("notes") ?? "");
    body["postId"] = form.get("postId") ? String(form.get("postId")) : null;
    body["vettingChecklist"] = Object.fromEntries(VETTING_ITEMS.map((i) => [i.key, form.get(i.key) === "on"]));
  }
  const r = await studioApi(auth).patch(`/v1/studio/orders/${params.id}`, body);
  return r.ok ? data({ ok: true, error: null }) : data({ ok: false, error: r.message }, { status: r.status });
}

export default function OrderPage({ loaderData, actionData }: Route.ComponentProps) {
  const { order, sponsoredPosts } = loaderData;
  const busy = useNavigation().state !== "idle";
  const next = ORDER_TRANSITIONS[order.status];
  const complete = vettingComplete(order.vettingChecklist);
  const locked = order.status === "published";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/sponsored" className="text-sm text-link hover:underline">All orders</Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold">{order.title}</h1>
        <p className="text-sm"><span className="text-muted">Status</span> <strong>{ORDER_STATUS_LABEL[order.status]}</strong></p>
      </div>
      <p className="text-muted">{order.sponsor.name}</p>

      {actionData?.error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}
      {actionData?.ok ? <p role="status" className="mt-4 text-sm text-ok">Saved.</p> : null}

      {next.length > 0 ? (
        <section aria-labelledby="move-h" className="mt-6 panel">
          <h2 id="move-h" className="font-display text-lg font-extrabold">Move this order</h2>
          {order.status === "vetting" && !complete ? <p className="mt-1 text-sm text-warn">Tick every vetting item and save before accepting.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((s) => (
              <Form method="post" key={s}>
                <input type="hidden" name="intent" value="status" />
                <input type="hidden" name="status" value={s} />
                <button className={`btn ${s === "rejected" ? "btn-danger" : "btn-primary"}`} disabled={busy || (s === "accepted" && !complete)}>
                  {s === "accepted" ? "Accept order" : s === "rejected" ? "Reject" : `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}`}
                </button>
              </Form>
            ))}
          </div>
          {order.status === "accepted" || order.status === "in_production" ? (
            <p className="mt-3 text-sm text-muted">The order is marked published automatically when its linked story goes live.</p>
          ) : null}
        </section>
      ) : null}

      <Form method="post" className="mt-6 grid gap-6 md:grid-cols-2">
        <input type="hidden" name="intent" value="save" />
        <fieldset className="panel space-y-3" disabled={locked}>
          <legend className="font-display text-lg font-extrabold">Vetting</legend>
          <p className="text-sm text-muted">Check each item yourself before ticking it.</p>
          {VETTING_ITEMS.map((i) => (
            <label key={i.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={i.key} defaultChecked={order.vettingChecklist[i.key] === true} className="mt-1" />
              <span>{i.label}</span>
            </label>
          ))}
          <p className="text-sm text-muted">
            Check the story's links on the <Link to="/link-safety" className="text-link underline">link safety</Link> list too.
          </p>
        </fieldset>

        <fieldset className="panel space-y-3" disabled={locked}>
          <legend className="font-display text-lg font-extrabold">Details</legend>
          <div><label htmlFor="title" className="label">Title</label><input id="title" name="title" defaultValue={order.title} required className="field" /></div>
          <div><label htmlFor="brief" className="label">Brief</label><textarea id="brief" name="brief" defaultValue={order.brief ?? ""} rows={3} className="field" /></div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div><label htmlFor="amount" className="label">Price</label><input id="amount" name="amount" defaultValue={order.amount ?? ""} inputMode="decimal" className="field" /></div>
            <div><label htmlFor="currency" className="label">Currency</label><input id="currency" name="currency" defaultValue={order.currency} maxLength={3} className="field uppercase" /></div>
          </div>
          <div>
            <label htmlFor="invoiceStatus" className="label">Invoice</label>
            <select id="invoiceStatus" name="invoiceStatus" defaultValue={order.invoiceStatus} className="field">
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="postId" className="label">Linked story</label>
            <select id="postId" name="postId" defaultValue={order.post?.id ?? ""} className="field">
              <option value="">Not linked</option>
              {sponsoredPosts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <p className="hint">Sponsored stories only. Linking attaches this sponsor to the story.</p>
          </div>
          <div><label htmlFor="notes" className="label">Internal notes</label><textarea id="notes" name="notes" defaultValue={order.notes ?? ""} rows={3} className="field" /></div>
        </fieldset>
        {locked ? null : (
          <div className="md:col-span-2">
            <button className="btn btn-primary" disabled={busy}>Save order</button>
          </div>
        )}
      </Form>
    </main>
  );
}
