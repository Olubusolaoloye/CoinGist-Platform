import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import {
  EVENT_CATEGORIES,
  hasAtLeast,
  LISTING_CATEGORY_LABEL,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_SAFETY_CHECKS,
  type ListingKind,
  type StudioListing,
} from "@coingist/types";
import type { Route } from "./+types/app.listings.$id";
import { ImageField } from "~/components/ImageField";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { readForm } from "~/lib/form.server";
import { studioHeaders } from "~/lib/headers";
import { useMe } from "~/lib/me";

export const headers = studioHeaders;
export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.listing ? "Edit" : "New"} ${data?.kind === "opportunity" ? "opportunity" : "event"} | CoinGist Studio` }];
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  if (params.id === "new") {
    const kind: ListingKind = new URL(request.url).searchParams.get("kind") === "opportunity" ? "opportunity" : "event";
    return data({ listing: null as StudioListing | null, kind, siteUrl: env.siteUrl }, { headers: auth.headers });
  }
  if (!UUID.test(params.id)) throw data({ error: "Not found" }, { status: 404 });
  const { listing } = await studioApi(auth).get<{ listing: StudioListing }>(`/v1/studio/listings/${params.id}`);
  return data({ listing, kind: listing.kind, siteUrl: env.siteUrl }, { headers: auth.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await readForm(request);
  const intent = String(form.get("intent") ?? "draft");
  const text = (k: string) => String(form.get(k) ?? "");
  const kind = text("kind") === "opportunity" ? "opportunity" : "event";

  if (intent === "delete") {
    const r = await api.del(`/v1/studio/listings/${params.id}`);
    if (!r.ok) return data({ error: r.message }, { status: r.status, headers: auth.headers });
    throw redirect(`/listings?kind=${kind}&saved=deleted`, { headers: auth.headers });
  }

  const body = {
    kind,
    category: text("category"),
    title: text("title"),
    summary: text("summary"),
    details: text("details"),
    url: text("url"),
    imageUrl: text("imageUrl"),
    imageAlt: text("imageAlt"),
    organizer: text("organizer"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    location: text("location"),
    isOnline: form.get("isOnline") === "on",
    reward: text("reward"),
    status: intent === "publish" ? "published" : "draft",
    // Ticked only when every item on the checklist is ticked.
    safetyChecked: kind === "opportunity" && OPPORTUNITY_SAFETY_CHECKS.every((_, i) => form.get(`check${i}`) === "on"),
  };
  const r = params.id === "new" ? await api.post("/v1/studio/listings", body) : await api.put(`/v1/studio/listings/${params.id}`, body);
  if (!r.ok) return data({ error: r.message }, { status: r.status, headers: auth.headers });
  throw redirect(`/listings?kind=${kind}&saved=1`, { headers: auth.headers });
}

/** ISO → the "yyyy-mm-ddThh:mm" a datetime-local input shows, in the browser's time zone. */
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function EditListing({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, kind, siteUrl } = loaderData;
  const me = useMe();
  const editor = hasAtLeast(me.user.role, "editor");
  const busy = useNavigation().state !== "idle";
  const isEvent = kind === "event";
  const categories = isEvent ? EVENT_CATEGORIES : OPPORTUNITY_CATEGORIES;
  const [image, setImage] = useState({ url: listing?.image?.url ?? "", alt: listing?.image?.alt ?? "" });
  const [url, setUrl] = useState(listing?.url ?? "");
  const [checks, setChecks] = useState<boolean[]>(() => OPPORTUNITY_SAFETY_CHECKS.map(() => listing?.safetyChecked ?? false));
  // Dates are shown in the editor's own time zone, so they're filled in after the page loads.
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  useEffect(() => {
    setStarts(toLocal(listing?.startsAt ?? null));
    setEnds(toLocal(listing?.endsAt ?? null));
  }, [listing]);
  // A new link must be checked again.
  useEffect(() => {
    if (listing && url !== listing.url) setChecks(OPPORTUNITY_SAFETY_CHECKS.map(() => false));
  }, [url, listing]);

  const allChecked = checks.every(Boolean);
  const live = listing?.status === "published";
  const publicPath = listing ? `${siteUrl}/${isEvent ? "events" : "opportunities"}/${listing.slug}` : null;

  return (
    <main className="space-y-5 px-3 py-6 sm:px-5">
      <header>
        <p className="text-sm"><Link to={`/listings?kind=${kind}`} className="text-link hover:underline">Events &amp; opportunities</Link> /</p>
        <h1 className="font-display text-3xl font-extrabold">{listing ? listing.title : isEvent ? "New event" : "New opportunity"}</h1>
        {live && publicPath ? (
          <p className="mt-1 text-sm">
            Live at <a href={publicPath} target="_blank" rel="noopener noreferrer" className="text-link underline">{publicPath.replace(/^https?:\/\//, "")}</a>
          </p>
        ) : null}
      </header>

      {actionData && "error" in actionData && actionData.error ? (
        <p role="alert" className="rounded-xl border border-bad bg-surface p-3 text-sm text-bad">{actionData.error}</p>
      ) : null}

      <Form
        method="post"
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"
        onSubmit={(e) => {
          const f = e.currentTarget;
          for (const [name, local] of [["startsAt", starts], ["endsAt", ends]] as const) {
            (f.elements.namedItem(name) as HTMLInputElement).value = local ? new Date(local).toISOString() : "";
          }
        }}
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="imageUrl" value={image.url} />
        <input type="hidden" name="imageAlt" value={image.alt} />
        <input type="hidden" name="startsAt" />
        <input type="hidden" name="endsAt" />

        <section className="panel space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div>
              <label htmlFor="title" className="label">Title</label>
              <input id="title" name="title" required minLength={3} maxLength={160} defaultValue={listing?.title ?? ""} className="field" />
            </div>
            <div>
              <label htmlFor="category" className="label">Type</label>
              <select id="category" name="category" defaultValue={listing?.category ?? categories[0]} className="field">
                {categories.map((c) => <option key={c} value={c}>{LISTING_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="summary" className="label">Summary</label>
            <textarea id="summary" name="summary" required minLength={10} maxLength={400} rows={2} defaultValue={listing?.summary ?? ""} className="field"
              placeholder={isEvent ? "What it is and who it's for, in a sentence or two." : "What readers can get and what they need to do."} />
          </div>
          <div>
            <label htmlFor="details" className="label">Details (optional)</label>
            <textarea id="details" name="details" maxLength={6000} rows={7} defaultValue={listing?.details ?? ""} className="field"
              placeholder={isEvent ? "Agenda, speakers, tickets, how to get there." : "Eligibility, steps, timelines. Never ask readers for keys or payments."} />
            <p className="hint">Plain text. Blank lines start new paragraphs.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="url" className="label">Official link</label>
              <input id="url" name="url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} className="field" placeholder="https://…" />
              <p className="hint">Checked against the link safety list when published.</p>
            </div>
            <div>
              <label htmlFor="organizer" className="label">{isEvent ? "Organiser" : "Project or organisation"}</label>
              <input id="organizer" name="organizer" maxLength={160} defaultValue={listing?.organizer ?? ""} className="field" />
            </div>
          </div>

          {isEvent ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="startsLocal" className="label">Starts</label>
                <input id="startsLocal" type="datetime-local" required value={starts} onChange={(e) => setStarts(e.target.value)} className="field" />
              </div>
              <div>
                <label htmlFor="endsLocal" className="label">Ends (optional)</label>
                <input id="endsLocal" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="field" />
              </div>
              <div>
                <label htmlFor="location" className="label">Where</label>
                <input id="location" name="location" maxLength={160} defaultValue={listing?.location ?? ""} className="field" placeholder="City, country" />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="isOnline" defaultChecked={listing?.isOnline ?? false} className="size-4" /> Online (or streamed)
              </label>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="endsLocal" className="label">Deadline (optional)</label>
                <input id="endsLocal" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="field" />
              </div>
              <div>
                <label htmlFor="reward" className="label">Reward (optional)</label>
                <input id="reward" name="reward" maxLength={200} defaultValue={listing?.reward ?? ""} className="field" placeholder="e.g. Up to $10,000" />
              </div>
              <div>
                <label htmlFor="location" className="label">Who can take part (optional)</label>
                <input id="location" name="location" maxLength={160} defaultValue={listing?.location ?? ""} className="field" placeholder="e.g. Builders in Africa" />
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="panel">
            <ImageField label="Image (optional)" url={image.url} alt={image.alt} onChange={setImage} hint="A banner or the project's logo. Wide images work best." />
          </section>

          {!isEvent ? (
            <fieldset className="panel space-y-2">
              <legend className="font-display text-lg font-extrabold">Safety checklist</legend>
              <p className="text-sm text-muted">Airdrops are the most common crypto scam. An editor must confirm every item before this can go live.</p>
              {OPPORTUNITY_SAFETY_CHECKS.map((c, i) => (
                <label key={c} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`check${i}`} checked={checks[i]} disabled={!editor}
                    onChange={(e) => setChecks((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5 size-4 shrink-0" />
                  <span>{c}</span>
                </label>
              ))}
              {!editor ? <p className="hint">An editor ticks these when they review it.</p> : null}
            </fieldset>
          ) : null}

          <section className="panel space-y-2">
            <button name="intent" value="draft" className="btn w-full" disabled={busy}>{live ? "Unpublish (save as draft)" : "Save draft"}</button>
            {editor ? (
              <button name="intent" value="publish" className="btn btn-primary w-full" disabled={busy || (!isEvent && !allChecked)}>
                {live ? "Save and keep live" : "Publish"}
              </button>
            ) : (
              <p className="hint">An editor publishes it.</p>
            )}
            {!isEvent && editor && !allChecked ? <p className="hint">Tick the whole safety checklist to publish.</p> : null}
          </section>

          {listing ? (
            <section className="panel">
              <button name="intent" value="delete" formNoValidate className="btn btn-danger w-full" disabled={busy}
                onClick={(e) => { if (!window.confirm("Delete this for good?")) e.preventDefault(); }}>
                Delete
              </button>
            </section>
          ) : null}
        </aside>
      </Form>
    </main>
  );
}
