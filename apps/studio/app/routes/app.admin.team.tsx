import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import { ROLES, STAFF_ROLES, type Role, type StaffInvite, type StaffInviteOutcome, type User } from "@coingist/types";
import type { Route } from "./+types/app.admin.team";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { sendInviteEmail } from "~/lib/invite-email.server";
import { formatShortDate } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Team and roles | CoinGist Studio" }];
}

const PAGE = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  const [{ users }, me, { invites }] = await Promise.all([
    api.get<{ users: User[] }>(`/v1/admin/users?limit=${PAGE + 1}&offset=${(page - 1) * PAGE}`),
    api.me(),
    api.get<{ invites: StaffInvite[] }>("/v1/admin/invites"),
  ]);
  return data(
    { users: users.slice(0, PAGE), hasMore: users.length > PAGE, page, meId: me.user.id, invites, loginUrl: `${env.studioUrl}/login` },
    { headers: auth.headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "this account");
  const intent = form.get("intent");

  if (intent === "invite") {
    const r = await api.post<{ outcome: StaffInviteOutcome; email: string; role: Role }>("/v1/admin/invites", {
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "writer"),
    });
    if (!r.ok) return data({ error: r.message, message: null }, { status: r.status, headers: auth.headers });
    const { outcome, email, role } = r.data;
    if (outcome === "existing") return data({ error: null, message: `${email} already had an account and is now ${article(role)} ${role}.` }, { headers: auth.headers });
    const mail = await sendInviteEmail(email);
    const message = mail.sent
      ? `Invite sent to ${email}. When they open the email link (or sign in with Google using that address), they'll join as ${article(role)} ${role}.`
      : mail.reason === "dev"
        ? `Invite saved for ${email} (no email in local dev mode).`
        : `Invite saved for ${email}, but the email couldn't be sent${mail.reason === "rate_limited" ? " (email limit reached, try again later)" : ""}. Ask them to sign in with Google at Studio using that address; they'll get the role automatically.`;
    return data({ error: null, message }, { headers: auth.headers });
  }
  if (intent === "cancel-invite") {
    const r = await api.del(`/v1/admin/invites/${String(form.get("id") ?? "")}`);
    if (!r.ok) return data({ error: r.message, message: null }, { status: r.status, headers: auth.headers });
    return data({ error: null, message: `Invite for ${String(form.get("email") ?? "that address")} cancelled.` }, { headers: auth.headers });
  }

  const r =
    intent === "role"
      ? await api.patch(`/v1/admin/users/${id}/role`, { role: form.get("role") })
      : await api.patch(`/v1/admin/users/${id}/status`, { status: intent === "suspend" ? "suspended" : "active" });
  if (!r.ok) {
    const error = /last active admin/i.test(r.message) ? "CoinGist needs at least one admin. Promote someone else first." : r.message;
    return data({ error, message: null }, { status: r.status, headers: auth.headers });
  }
  const message =
    intent === "role" ? `${name} is now ${String(form.get("role"))}.` : intent === "suspend" ? `${name} is suspended and signed out of Studio.` : `${name} is active again.`;
  return data({ error: null, message }, { headers: auth.headers });
}

const article = (role: string) => (role === "editor" || role === "admin" ? "an" : "a");

const ROLE_HELP: Record<Role, string> = {
  reader: "Reads the site; no Studio access",
  writer: "Writes and submits stories",
  editor: "Reviews, publishes, sponsorship and ads",
  admin: "Everything, including team, payouts and audit",
};

export default function Team({ loaderData, actionData }: Route.ComponentProps) {
  const { users, hasMore, page, meId, invites, loginUrl } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [params] = useSearchParams();
  const staffOnly = params.get("staff") === "1";
  const shown = staffOnly ? users.filter((u) => u.role !== "reader") : users;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <p className="text-sm"><Link to="/admin" className="text-link hover:underline">Admin</Link> /</p>
      <h1 className="font-display text-3xl font-extrabold">Team and roles</h1>
      <p className="mt-1 max-w-3xl text-muted">
        Changes take effect on the person's next click. Staff must set up two-factor sign-in before they can use Studio.
        Every change is recorded in the audit log.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-md border border-line px-3 py-2">
            <dt className="font-semibold capitalize">{r}</dt>
            <dd className="text-muted">{ROLE_HELP[r]}</dd>
          </div>
        ))}
      </dl>

      <div role="status" className="mt-4 min-h-6 text-sm">
        {actionData?.message ? <p className="text-ok">{actionData.message}</p> : null}
      </div>
      {actionData?.error ? <p role="alert" className="rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}

      <section aria-labelledby="invite-h" className="panel mt-4">
        <h2 id="invite-h" className="font-display text-lg font-extrabold">Invite someone</h2>
        <p className="mt-1 text-sm text-muted">
          They get an email with a sign-in link. They can also sign in with Google at <span className="font-semibold">{loginUrl}</span> using
          the same address. Either way they join with the role you pick. Invites last 14 days.
        </p>
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="invite" />
          <div className="min-w-64 flex-1">
            <label htmlFor="invite-email" className="label">Email address</label>
            <input id="invite-email" name="email" type="email" required autoComplete="off" className="field" placeholder="writer@example.com" />
          </div>
          <div>
            <label htmlFor="invite-role" className="label">Role</label>
            <select id="invite-role" name="role" defaultValue="writer" className="field w-auto">
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy}>Send invite</button>
        </Form>

        {invites.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Waiting to join</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span className="font-semibold">{i.email}</span>
                  <span className="capitalize text-muted">{i.role}</span>
                  <span className="text-muted">Expires {formatShortDate(i.expiresAt)}</span>
                  <span className="ml-auto flex gap-3">
                    <Form method="post">
                      <input type="hidden" name="intent" value="invite" />
                      <input type="hidden" name="email" value={i.email} />
                      <input type="hidden" name="role" value={i.role} />
                      <button className="font-semibold text-link hover:underline" disabled={busy} aria-label={`Resend invite to ${i.email}`}>Resend</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="cancel-invite" />
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="email" value={i.email} />
                      <button className="font-semibold text-bad hover:underline" disabled={busy} aria-label={`Cancel invite to ${i.email}`}>Cancel</button>
                    </Form>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="mt-6 flex gap-2 text-sm">
        <Link to="?" className={`rounded-full border px-3 py-1 ${!staffOnly ? "border-ink bg-ink text-paper" : "border-line"}`}>Everyone</Link>
        <Link to="?staff=1" className={`rounded-full border px-3 py-1 ${staffOnly ? "border-ink bg-ink text-paper" : "border-line"}`}>Staff only</Link>
      </div>

      <div className="panel mt-3 overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Person</th>
              <th scope="col" className="px-4 py-2 font-semibold">Role</th>
              <th scope="col" className="px-4 py-2 font-semibold">Two-factor</th>
              <th scope="col" className="px-4 py-2 font-semibold">Joined</th>
              <th scope="col" className="px-4 py-2 font-semibold">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((u) => {
              const label = u.name ?? u.email;
              const isMe = u.id === meId;
              const staff = u.role !== "reader";
              return (
                <tr key={u.id} className={u.status !== "active" ? "opacity-70" : ""}>
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="block font-semibold">{label}{isMe ? " (you)" : ""}</span>
                    <span className="text-muted">{u.email}</span>
                  </th>
                  <td className="px-4 py-2">
                    <Form method="post" className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="name" value={label} />
                      <label htmlFor={`role-${u.id}`} className="sr-only">Role for {label}</label>
                      <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="field w-auto py-1" disabled={busy}>
                        {ROLES.map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}
                      </select>
                      <button name="intent" value="role" className="btn py-1" disabled={busy} aria-label={`Save role for ${label}`}>Save</button>
                    </Form>
                  </td>
                  <td className="px-4 py-2">
                    {u.twoFactorEnabled ? <span className="text-ok">On</span> : staff ? <span className="font-semibold text-warn">Not set up</span> : <span className="text-muted">Not needed</span>}
                  </td>
                  <td className="px-4 py-2 text-muted">{formatShortDate(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    {u.status === "suspended" ? <span className="mr-2 font-semibold text-bad">Suspended</span> : null}
                    {u.status === "deactivated" ? <span className="mr-2 font-semibold text-muted" title="They deactivated their own account. Signing in again reactivates it.">Deactivated by them</span> : null}
                    {isMe ? null : (
                      <Form
                        method="post"
                        className="inline"
                        onSubmit={(e) => {
                          if (u.status === "active" && !window.confirm(`Suspend ${label}? They'll be signed out of Studio and can't sign in.`)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="name" value={label} />
                        <button
                          name="intent"
                          value={u.status !== "active" ? "reactivate" : "suspend"}
                          className={`font-semibold hover:underline ${u.status !== "active" ? "text-link" : "text-bad"}`}
                          disabled={busy}
                          aria-label={`${u.status !== "active" ? "Reactivate" : "Suspend"} ${label}`}
                        >
                          {u.status !== "active" ? "Reactivate" : "Suspend"}
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pages" className="mt-4 flex gap-2">
        {page > 1 ? <Link className="btn" to={`?page=${page - 1}${staffOnly ? "&staff=1" : ""}`}>Newer</Link> : null}
        {hasMore ? <Link className="btn" to={`?page=${page + 1}${staffOnly ? "&staff=1" : ""}`}>Older</Link> : null}
      </nav>
    </main>
  );
}
