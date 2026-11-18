import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import { ROLES, type Role, type User } from "@coingist/types";
import type { Route } from "./+types/app.admin.team";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
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
  const [{ users }, me] = await Promise.all([
    api.get<{ users: User[] }>(`/v1/admin/users?limit=${PAGE + 1}&offset=${(page - 1) * PAGE}`),
    api.me(),
  ]);
  return data({ users: users.slice(0, PAGE), hasMore: users.length > PAGE, page, meId: me.user.id }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "this account");
  const intent = form.get("intent");
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

const ROLE_HELP: Record<Role, string> = {
  reader: "Reads the site; no Studio access",
  writer: "Writes and submits stories",
  editor: "Reviews, publishes, sponsorship and ads",
  admin: "Everything, including team, payouts and audit",
};

export default function Team({ loaderData, actionData }: Route.ComponentProps) {
  const { users, hasMore, page, meId } = loaderData;
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

      <div className="mt-2 flex gap-2 text-sm">
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
                <tr key={u.id} className={u.status === "suspended" ? "opacity-70" : ""}>
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
                    {isMe ? null : (
                      <Form
                        method="post"
                        className="inline"
                        onSubmit={(e) => {
                          if (u.status !== "suspended" && !window.confirm(`Suspend ${label}? They'll be signed out of Studio and can't sign in.`)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="name" value={label} />
                        <button
                          name="intent"
                          value={u.status === "suspended" ? "reactivate" : "suspend"}
                          className={`font-semibold hover:underline ${u.status === "suspended" ? "text-link" : "text-bad"}`}
                          disabled={busy}
                          aria-label={`${u.status === "suspended" ? "Reactivate" : "Suspend"} ${label}`}
                        >
                          {u.status === "suspended" ? "Reactivate" : "Suspend"}
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
