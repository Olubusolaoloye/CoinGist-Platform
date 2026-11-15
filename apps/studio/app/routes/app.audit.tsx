import { data } from "react-router";
import type { AuditLog } from "@coingist/types";
import type { Route } from "./+types/app.audit";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Audit log | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { logs } = await studioApi(auth).get<{ logs: AuditLog[] }>("/v1/admin/audit-logs?limit=200");
  return data({ logs }, { headers: auth.headers });
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Audit log</h1>
      <p className="mt-1 text-muted">Role changes and every status change on every post. Entries can't be edited or deleted.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">When</th>
              <th scope="col" className="px-4 py-3">Action</th>
              <th scope="col" className="px-4 py-3">Item</th>
              <th scope="col" className="px-4 py-3">Details</th>
              <th scope="col" className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loaderData.logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 whitespace-nowrap text-muted">{formatWhen(l.createdAt)}</td>
                <td className="px-4 py-2 font-medium">{l.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.entity}/{l.entityId?.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs">{Object.entries(l.metadata).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.actorId?.slice(0, 8) ?? "system"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
