import { data } from "react-router";
import type { WriterEarnings } from "@coingist/types";
import type { Route } from "./+types/app.earnings";
import { StatTile } from "~/components/Dashboard";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatMoney, formatShortDate, sumByCurrency } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";
import { PAYMENT_LABEL } from "~/lib/payments";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "My earnings | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { earnings } = await studioApi(auth).get<{ earnings: WriterEarnings }>("/v1/studio/earnings");
  return data({ earnings }, { headers: auth.headers });
}

export default function Earnings({ loaderData }: Route.ComponentProps) {
  const { earnings: e } = loaderData;
  const by = (s: string) => e.totals.filter((t) => t.status === s);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">My earnings</h1>
      <p className="mt-1 text-muted">Payments the CoinGist team has recorded for your work. Questions about a payment? Ask an admin.</p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Paid to you" value={sumByCurrency(by("paid"))} />
        <StatTile label="Approved, on its way" value={sumByCurrency(by("approved"))} />
        <StatTile label="Pending approval" value={sumByCurrency(by("pending"))} />
        <StatTile label="Stories published" value={e.publishedAllTime} detail={`${e.published30d} in the last 30 days`} />
      </dl>

      <section aria-labelledby="payments-h" className="mt-8">
        <h2 id="payments-h" className="font-display text-xl font-extrabold">Payments</h2>
        {e.payments.length === 0 ? (
          <p className="panel mt-3 text-sm text-muted">No payments recorded yet. They appear here once an admin records them, usually after a story is published.</p>
        ) : (
          <div className="panel mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">For</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {e.payments.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-4 py-2 font-normal">
                      <span className="block font-semibold">{p.post?.title ?? p.note ?? "Payment"}</span>
                      <span className="text-muted">Recorded {formatShortDate(p.createdAt)}{p.post && p.note ? ` · ${p.note}` : ""}</span>
                    </th>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className={`px-4 py-2 ${p.status === "paid" ? "text-ok" : p.status === "cancelled" ? "text-muted" : ""}`}>
                      {PAYMENT_LABEL[p.status]}{p.paidAt ? ` ${formatShortDate(p.paidAt)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
