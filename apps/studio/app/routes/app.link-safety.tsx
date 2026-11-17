import { data, Form, useNavigation } from "react-router";
import { hasAtLeast, type BlockedDomain } from "@coingist/types";
import type { Route } from "./+types/app.link-safety";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";
import { useMe } from "~/lib/me";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Link safety | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { domains } = await studioApi(auth).get<{ domains: BlockedDomain[] }>("/v1/studio/blocked-domains");
  return data({ domains }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const r =
    form.get("intent") === "remove"
      ? await api.del(`/v1/studio/blocked-domains/${encodeURIComponent(String(form.get("domain")))}`)
      : await api.post("/v1/studio/blocked-domains", { domain: String(form.get("domain") ?? ""), reason: String(form.get("reason") ?? "") });
  return r.ok ? data({ ok: true, error: null }) : data({ ok: false, error: r.message }, { status: r.status });
}

export default function LinkSafety({ loaderData, actionData }: Route.ComponentProps) {
  const me = useMe();
  const canEdit = hasAtLeast(me.user.role, "editor");
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Link safety</h1>
      <p className="mt-1 text-muted">
        Stories can't be approved while they link to these domains or their subdomains, and sponsored stories are checked against
        the sponsor's website too. Add scam sites, fake exchanges and phishing pages as you find them.
      </p>
      {canEdit ? (
        <Form method="post" className="mt-6 grid gap-3 panel sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <div><label htmlFor="domain" className="label">Domain</label><input id="domain" name="domain" required className="field" placeholder="fake-exchange.com" /></div>
          <div><label htmlFor="reason" className="label">Why it's blocked</label><input id="reason" name="reason" required maxLength={300} className="field" placeholder="Impersonates a real exchange" /></div>
          <button className="btn btn-primary" disabled={busy}>Block domain</button>
        </Form>
      ) : null}
      {actionData?.error ? <p role="alert" className="mt-3 text-sm text-bad">{actionData.error}</p> : null}
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
        {loaderData.domains.length === 0 ? <li className="px-4 py-3 text-muted">No domains blocked yet.</li> : null}
        {loaderData.domains.map((d) => (
          <li key={d.domain} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="font-mono text-sm font-semibold">{d.domain}</span>
            <span className="text-sm">{d.reason}</span>
            <span className="ml-auto text-xs text-muted">Added {formatWhen(d.createdAt)}</span>
            {canEdit ? (
              <Form method="post">
                <input type="hidden" name="intent" value="remove" />
                <input type="hidden" name="domain" value={d.domain} />
                <button className="text-sm font-semibold text-bad hover:underline" disabled={busy} aria-label={`Unblock ${d.domain}`}>Unblock</button>
              </Form>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
