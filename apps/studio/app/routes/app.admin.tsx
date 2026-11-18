import { data, Link } from "react-router";
import type { AdminDashboard } from "@coingist/types";
import type { Route } from "./+types/app.admin";
import { Card, StatTile } from "~/components/Dashboard";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { ago, plural, sumByCurrency } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Admin | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { dashboard } = await studioApi(auth).get<{ dashboard: AdminDashboard }>("/v1/admin/dashboard");
  return data({ dashboard, now: new Date().toISOString() }, { headers: auth.headers });
}

const ACTION_LABEL: Record<string, string> = {
  "user.role_changed": "changed a role",
  "user.status_changed": "changed an account's status",
  "post.transition": "moved a story",
  "post.status_changed": "moved a story",
  "writer_payment.created": "recorded a payment",
  "writer_payment.status_changed": "updated a payment",
  "sponsored_order.status_changed": "moved a sponsored order",
};

export default function AdminPage({ loaderData }: Route.ComponentProps) {
  const { dashboard: d, now } = loaderData;
  const staff = d.team.byRole.writer + d.team.byRole.editor + d.team.byRole.admin;
  const owed = d.payouts.totals.filter((t) => t.status === "pending" || t.status === "approved");
  const pipeline = d.sponsorship.orders.filter((o) => o.status === "accepted" || o.status === "in_production");
  const overdue = d.sponsorship.outstanding.filter((o) => o.status === "overdue");
  const no2fa = d.team.staffWithout2fa;

  const attention = [
    no2fa.length ? { text: `${no2fa.length} staff account${no2fa.length === 1 ? " hasn't" : "s haven't"} set up two-factor sign-in, so ${no2fa.length === 1 ? "it" : "they"} can't use Studio yet.`, to: "/admin/team", cta: "Review team" } : null,
    d.payouts.unpaidStories ? { text: `${d.payouts.unpaidStories} published ${d.payouts.unpaidStories === 1 ? "story has" : "stories have"} no payment recorded.`, to: "/admin/payouts", cta: "Record payments" } : null,
    owed.length ? { text: `${sumByCurrency(owed)} is owed to writers (pending or approved).`, to: "/admin/payouts?status=approved", cta: "Pay writers" } : null,
    overdue.length ? { text: `${overdue.reduce((n, o) => n + o.count, 0)} sponsor invoice(s) overdue: ${sumByCurrency(overdue)}.`, to: "/sponsored", cta: "Chase invoices" } : null,
    d.ads.awaitingApproval ? { text: `${d.ads.awaitingApproval} ad booking${d.ads.awaitingApproval === 1 ? " is" : "s are"} waiting for approval.`, to: "/ads", cta: "Review ads" } : null,
  ].filter((x): x is { text: string; to: string; cta: string } => x !== null);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Admin</h1>
          <p className="mt-1 text-muted">The team, the money and the trail. Editorial work lives on the <Link to="/dashboard" className="text-link underline">editor dashboard</Link>.</p>
        </div>
        <nav aria-label="Admin" className="flex gap-2">
          <Link to="/admin/team" className="btn">Team and roles</Link>
          <Link to="/admin/payouts" className="btn">Payouts</Link>
          <Link to="/audit" className="btn">Audit log</Link>
        </nav>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Staff" value={staff} detail={`${plural(d.team.byRole.writer, "writer")}, ${plural(d.team.byRole.editor, "editor")}, ${plural(d.team.byRole.admin, "admin")}`} to="/admin/team" />
        <StatTile label="Readers with accounts" value={d.team.byRole.reader} detail={d.team.suspended ? `${d.team.suspended} suspended account${d.team.suspended === 1 ? "" : "s"}` : "No suspended accounts"} />
        <StatTile label="Owed to writers" value={owed.length ? sumByCurrency(owed) : "Nothing"} detail={`${d.payouts.unpaidStories} published ${d.payouts.unpaidStories === 1 ? "story" : "stories"} without a payment`} to="/admin/payouts" />
        <StatTile label="Published, last 30 days" value={d.publishing.published30d} detail={`${d.publishing.inReview} in review, ${d.publishing.scheduled} scheduled`} to="/dashboard" />
        <StatTile label="Sponsorship in progress" value={sumByCurrency(pipeline)} detail="Accepted or in production" to="/sponsored" />
        <StatTile label="Invoices outstanding" value={sumByCurrency(d.sponsorship.outstanding)} detail={overdue.length ? `${sumByCurrency(overdue)} overdue` : "None overdue"} {...(overdue.length ? { tone: "bad" as const } : {})} to="/sponsored" />
        <StatTile label="Live ads" value={d.ads.live} detail={`${d.ads.liveClicks} click${d.ads.liveClicks === 1 ? "" : "s"} on live bookings`} to="/ads" />
        <StatTile label="Staff without 2FA" value={no2fa.length} detail={no2fa.length ? "Blocked from Studio until set up" : "Everyone is protected"} {...(no2fa.length ? { tone: "warn" as const } : {})} to="/admin/team" />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card id="attention-h" title="Needs attention">
          {attention.length === 0 ? (
            <p className="text-sm text-muted">Nothing needs an admin right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.text} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                  <span>{a.text}</span>
                  <Link to={a.to} className="font-semibold text-link hover:underline">{a.cta}</Link>
                </li>
              ))}
            </ul>
          )}
          {no2fa.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-link">Who hasn't set up 2FA</summary>
              <ul className="mt-2 list-disc pl-5">
                {no2fa.map((u) => <li key={u.id}>{u.name ?? u.email} <span className="text-muted capitalize">({u.role})</span></li>)}
              </ul>
            </details>
          ) : null}
        </Card>

        <Card id="activity-h" title="Recent activity" action={<Link to="/audit" className="font-semibold text-link hover:underline">Full audit log</Link>}>
          {d.recentActivity.length === 0 ? (
            <p className="text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span><strong>{a.actorName ?? "System"}</strong> {ACTION_LABEL[a.action] ?? a.action}</span>
                  <span className="shrink-0 text-muted">{ago(a.createdAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
