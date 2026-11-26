import { data, Link, useSearchParams } from "react-router";
import { LISTING_CATEGORY_LABEL, type ListingKind, type StudioListing } from "@coingist/types";
import type { Route } from "./+types/app.listings";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Events & opportunities | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const kind: ListingKind = new URL(request.url).searchParams.get("kind") === "opportunity" ? "opportunity" : "event";
  const { listings } = await studioApi(auth).get<{ listings: StudioListing[] }>(`/v1/studio/listings?kind=${kind}`);
  return data({ listings, kind, now: new Date().toISOString() }, { headers: auth.headers });
}

function state(l: StudioListing, now: string): { label: string; cls: string } {
  if (l.status === "draft") return { label: "Draft", cls: "border-line text-muted" };
  const end = l.kind === "event" ? (l.endsAt ?? l.startsAt) : l.endsAt;
  if (end && end < now) return { label: l.kind === "event" ? "Past" : "Closed", cls: "border-line text-muted" };
  return { label: "Live", cls: "border-gist bg-gist text-gist-ink" };
}

export default function Listings({ loaderData }: Route.ComponentProps) {
  const { listings, kind, now } = loaderData;
  const [params] = useSearchParams();
  const saved = params.get("saved");
  const isEvent = kind === "event";
  return (
    <main className="space-y-5 px-3 py-6 sm:px-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Newsroom</p>
          <h1 className="font-display text-3xl font-extrabold">Events &amp; opportunities</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Crypto events, and airdrops, grants, hackathons and bounties for readers. Writers draft; editors publish.
            Opportunities need the safety checklist ticked before they can go live.
          </p>
        </div>
        <Link to={`/listings/new?kind=${kind}`} className="btn btn-primary">{isEvent ? "New event" : "New opportunity"}</Link>
      </header>

      <nav aria-label="Listing type" className="flex gap-2 text-sm">
        {(["event", "opportunity"] as const).map((k) => (
          <Link key={k} to={`?kind=${k}`} aria-current={kind === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${kind === k ? "border-ink bg-ink text-paper" : "border-line"}`}>
            {k === "event" ? "Events" : "Airdrops & opportunities"}
          </Link>
        ))}
      </nav>

      {saved ? <p role="status" className="text-sm text-ok">{saved === "deleted" ? "Deleted." : "Saved."}</p> : null}

      {listings.length === 0 ? (
        <p className="panel text-muted">{isEvent ? "No events yet." : "No opportunities yet."}</p>
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => {
            const s = state(l, now);
            return (
              <li key={l.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                    <span className="text-muted">{LISTING_CATEGORY_LABEL[l.category]}</span>
                    {l.kind === "opportunity" && !l.safetyChecked ? <span className="text-xs font-semibold text-warn">Safety check needed</span> : null}
                  </p>
                  <h2 className="mt-1 font-display text-lg font-extrabold">
                    <Link to={`/listings/${l.id}`} className="hover:underline">{l.title}</Link>
                  </h2>
                  <p className="text-sm text-muted">
                    {l.kind === "event"
                      ? `${l.startsAt ? formatWhen(l.startsAt) : ""}${l.isOnline ? " · Online" : l.location ? ` · ${l.location}` : ""}`
                      : l.endsAt ? `Deadline ${formatWhen(l.endsAt)}` : "No deadline"}
                  </p>
                </div>
                <Link to={`/listings/${l.id}`} className="btn py-1">Edit</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
