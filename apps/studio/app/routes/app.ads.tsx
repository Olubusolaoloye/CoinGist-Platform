import { useEffect, useRef, useState } from "react";
import { data, Form, Link, useNavigation } from "react-router";
import type { AdBooking, AdSlot, Sponsor } from "@coingist/types";
import type { Route } from "./+types/app.ads";
import { StatTile } from "~/components/Dashboard";
import { ImageField } from "~/components/ImageField";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Ads | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const [{ slots }, { bookings }, { sponsors }] = await Promise.all([
    api.get<{ slots: AdSlot[] }>("/v1/studio/ads/slots"),
    api.get<{ bookings: AdBooking[] }>("/v1/studio/ads/bookings"),
    api.get<{ sponsors: Sponsor[] }>("/v1/studio/sponsors"),
  ]);
  return data({ slots, bookings, sponsors, now: new Date().toISOString(), siteUrl: env.siteUrl }, { headers: auth.headers });
}

type ActionResult = { ok: boolean; intent: string; id: string; error: string | null; sponsorId?: string };

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  const text = (k: string) => String(form.get(k) ?? "");
  const done = (r: { ok: boolean; status?: number; message?: string }, extra: Partial<ActionResult> = {}) =>
    r.ok
      ? data<ActionResult>({ ok: true, intent, id, error: null, ...extra }, { headers: auth.headers })
      : data<ActionResult>({ ok: false, intent, id, error: r.message ?? "Something went wrong", ...extra }, { status: r.status ?? 400, headers: auth.headers });

  if (intent === "approve" || intent === "unapprove") return done(await api.patch(`/v1/studio/ads/bookings/${id}`, { approved: intent === "approve" }));
  if (intent === "delete") return done(await api.del(`/v1/studio/ads/bookings/${id}`));
  if (intent === "update") {
    return done(
      await api.patch(`/v1/studio/ads/bookings/${id}`, {
        startsAt: text("startsAt"),
        endsAt: text("endsAt"),
        creativeUrl: text("creativeUrl"),
        altText: text("altText"),
        clickUrl: text("clickUrl"),
      }),
    );
  }

  // New booking, optionally for a sponsor added on the spot.
  let sponsorId = text("sponsorId");
  if (sponsorId === "new") {
    const s = await api.post<{ sponsor: Sponsor }>("/v1/studio/sponsors", { name: text("sponsorName"), website: text("sponsorWebsite") });
    if (!s.ok) return done(s);
    sponsorId = s.data.sponsor.id;
  }
  return done(
    await api.post("/v1/studio/ads/bookings", {
      slotKey: text("slotKey"),
      sponsorId,
      startsAt: text("startsAt"),
      endsAt: text("endsAt"),
      creativeUrl: text("creativeUrl"),
      clickUrl: text("clickUrl"),
      altText: text("altText"),
    }),
    // If the booking fails, the form keeps the sponsor that was just added (no duplicate on retry).
    { sponsorId },
  );
}

/** Tailwind aspect classes for the slot shapes (static so Tailwind generates them). */
function aspectClass(slot: AdSlot | undefined): string {
  if (!slot) return "aspect-[3/1]";
  const r = slot.width / slot.height;
  if (Math.abs(r - 4.8) < 0.05) return "aspect-[24/5]";
  if (Math.abs(r - 3) < 0.05) return "aspect-[3/1]";
  if (Math.abs(r - 16 / 9) < 0.05) return "aspect-[16/9]";
  return "aspect-[3/1]";
}

type State = { label: string; cls: string; key: "pending" | "ended" | "scheduled" | "live" };
function state(b: AdBooking, now: string): State {
  if (!b.approved) return { key: "pending", label: "Awaiting approval", cls: "border-warn text-warn" };
  if (b.endsAt <= now) return { key: "ended", label: "Ended", cls: "border-line text-muted" };
  if (b.startsAt > now) return { key: "scheduled", label: "Scheduled", cls: "border-link text-link" };
  return { key: "live", label: "Live", cls: "border-gist bg-gist text-gist-ink" };
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** datetime-local has no time zone: turn the editor's local time into ISO before sending. */
function localTimesToIso(f: HTMLFormElement) {
  for (const n of ["startsAt", "endsAt"]) {
    const local = f.elements.namedItem(`${n}Local`) as HTMLInputElement;
    (f.elements.namedItem(n) as HTMLInputElement).value = local.value ? new Date(local.value).toISOString() : "";
  }
}
/** ISO → the "yyyy-mm-ddThh:mm" a datetime-local input shows, in the browser's time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Creatives can be a path on the public site ("/ads/x.png"): show those from the site, not Studio. */
let siteOrigin = "";
const imgSrc = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? `${siteOrigin}${url}` : url);

const placementLabel = (p: string) => (p === "newsletter" ? "Newsletter" : p === "home" ? "Home page" : p === "article" ? "Every story" : p);

export default function Ads({ loaderData, actionData }: Route.ComponentProps) {
  const { slots, bookings, sponsors, now, siteUrl } = loaderData;
  siteOrigin = siteUrl;
  const counts = { live: 0, pending: 0, scheduled: 0 };
  let liveClicks = 0;
  for (const b of bookings) {
    const k = state(b, now).key;
    if (k === "live") liveClicks += b.clicks;
    if (k !== "ended") counts[k]++;
  }
  const totalClicks = bookings.reduce((n, b) => n + b.clicks, 0);
  const rowError = actionData && !actionData.ok && actionData.intent !== "create" ? actionData : null;

  return (
    <main className="space-y-6 px-3 py-6 sm:px-5">
      <header>
        <p className="eyebrow">Business</p>
        <h1 className="font-display text-3xl font-extrabold">Ads</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Banners on the site and sponsor slots in the newsletters. A booking goes live only after an editor approves it, its link
          passes the <Link to="/link-safety" className="text-link underline">link safety list</Link>, and nothing else is booked in that slot for those dates.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Live now" value={counts.live} detail={counts.live ? `${liveClicks} click${liveClicks === 1 ? "" : "s"} so far` : "No ads showing"} />
        <StatTile label="Awaiting approval" value={counts.pending} detail="Check the image and link, then approve" {...(counts.pending ? { tone: "warn" as const } : {})} />
        <StatTile label="Scheduled" value={counts.scheduled} detail="Approved, starts later" />
        <StatTile label="Clicks, all bookings" value={totalClicks} detail={`${sponsors.length} sponsor${sponsors.length === 1 ? "" : "s"}`} />
      </dl>

      {rowError ? <p role="alert" className="rounded-xl border border-bad bg-surface p-3 text-sm text-bad">{rowError.error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} bookings={bookings.filter((b) => b.slot.key === slot.key)} now={now} />
          ))}
        </div>
        <aside>
          <div className="xl:sticky xl:top-4">
            <NewBooking slots={slots} sponsors={sponsors} result={actionData?.intent === "create" ? actionData : undefined} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function SlotCard({ slot, bookings, now }: { slot: AdSlot; bookings: AdBooking[]; now: string }) {
  const live = bookings.find((b) => state(b, now).key === "live");
  const emptyNote =
    slot.placement === "home" ? "Empty: readers see a Daily Gist newsletter promo here." : slot.placement === "article" ? "Empty: nothing is shown at the end of stories." : "Empty: the newsletter goes out without a sponsor.";
  return (
    <section aria-labelledby={`slot-${slot.key}`} className="panel space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id={`slot-${slot.key}`} className="font-display text-xl font-extrabold">{slot.name}</h2>
          <p className="text-sm text-muted">{placementLabel(slot.placement)} · {slot.width} × {slot.height} px image</p>
        </div>
        {live ? <span className="text-sm font-semibold text-ok">Showing {live.sponsor.name} until {formatWhen(live.endsAt)}</span> : null}
      </div>

      {live ? (
        <div style={{ maxWidth: slot.width }}>
          <p className="mb-1.5 text-xs text-muted">Advertisement from {live.sponsor.name}</p>
          <div className="overflow-hidden rounded-xl border border-line bg-paper" style={{ aspectRatio: `${slot.width} / ${slot.height}` }}>
            <img src={imgSrc(live.creativeUrl)} alt={live.altText} className="h-full w-full object-cover" />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">{emptyNote}</p>
      )}

      {bookings.length === 0 ? null : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {bookings.map((b) => <BookingRow key={b.id} booking={b} slot={slot} now={now} />)}
        </ul>
      )}
    </section>
  );
}

function BookingRow({ booking: b, slot, now }: { booking: AdBooking; slot: AdSlot; now: string }) {
  const [editing, setEditing] = useState(false);
  const busy = useNavigation().state !== "idle";
  const s = state(b, now);
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-paper" style={{ aspectRatio: `${slot.width} / ${slot.height}` }}>
          <img src={imgSrc(b.creativeUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{b.sponsor.name}</span>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
          </p>
          <p className="text-muted">{formatWhen(b.startsAt)} to {formatWhen(b.endsAt)}</p>
          <p className="text-muted">
            Links to <a href={b.clickUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">{host(b.clickUrl)}</a> · {b.clicks} click{b.clicks === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Form method="post">
            <input type="hidden" name="id" value={b.id} />
            <button name="intent" value={b.approved ? "unapprove" : "approve"} className={`btn ${b.approved ? "" : "btn-primary"}`} disabled={busy}>
              {b.approved ? "Pause" : "Approve"}
            </button>
          </Form>
          <button type="button" className="btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</button>
          <Form method="post" onSubmit={(e) => { if (!window.confirm(`Delete ${b.sponsor.name}'s booking?`)) e.preventDefault(); }}>
            <input type="hidden" name="id" value={b.id} />
            <button name="intent" value="delete" className="btn btn-danger" disabled={busy}>Delete</button>
          </Form>
        </div>
      </div>
      {/* Only rendered after a click, in the browser, so local times never differ from the server's render. */}
      {editing ? <EditBooking booking={b} slot={slot} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}

function EditBooking({ booking: b, slot, onDone }: { booking: AdBooking; slot: AdSlot; onDone: () => void }) {
  const [image, setImage] = useState({ url: b.creativeUrl, alt: b.altText });
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="mt-3 grid gap-3 rounded-xl border border-line bg-paper p-3 md:grid-cols-2" onSubmit={(e) => { localTimesToIso(e.currentTarget); onDone(); }}>
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="creativeUrl" value={image.url} />
      <input type="hidden" name="altText" value={image.alt} />
      <ImageField label="Ad image" url={image.url} alt={image.alt} onChange={setImage} ratio={aspectClass(slot)} hint={`${slot.width} × ${slot.height} px. A new image or link needs approving again.`} />
      <div className="space-y-3">
        <div>
          <label htmlFor={`s-${b.id}`} className="label">Starts</label>
          <input id={`s-${b.id}`} name="startsAtLocal" type="datetime-local" required className="field" defaultValue={toLocalInput(b.startsAt)} />
          <input type="hidden" name="startsAt" />
        </div>
        <div>
          <label htmlFor={`e-${b.id}`} className="label">Ends</label>
          <input id={`e-${b.id}`} name="endsAtLocal" type="datetime-local" required className="field" defaultValue={toLocalInput(b.endsAt)} />
          <input type="hidden" name="endsAt" />
        </div>
        <div>
          <label htmlFor={`c-${b.id}`} className="label">Click-through address</label>
          <input id={`c-${b.id}`} name="clickUrl" type="url" required className="field" defaultValue={b.clickUrl} />
        </div>
        <button className="btn btn-primary" disabled={busy || !image.url || !image.alt}>Save changes</button>
      </div>
    </Form>
  );
}

function NewBooking({ slots, sponsors, result }: { slots: AdSlot[]; sponsors: Sponsor[]; result: ActionResult | undefined }) {
  const busy = useNavigation().state !== "idle";
  const [slotKey, setSlotKey] = useState(slots[0]?.key ?? "");
  const [sponsorId, setSponsorId] = useState(sponsors[0]?.id ?? "new");
  const [image, setImage] = useState({ url: "", alt: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const slot = slots.find((s) => s.key === slotKey) ?? slots[0];

  // After a booking is made, clear the form. If it failed after adding a sponsor, select that sponsor.
  const seen = useRef<ActionResult | undefined>(undefined);
  useEffect(() => {
    if (!result || result === seen.current) return;
    seen.current = result;
    if (result.sponsorId && sponsors.some((s) => s.id === result.sponsorId)) setSponsorId(result.sponsorId);
    if (result.ok) {
      formRef.current?.reset();
      setImage({ url: "", alt: "" });
    }
  }, [result, sponsors]);
  const sponsorName = sponsors.find((s) => s.id === sponsorId)?.name;
  return (
    <section aria-labelledby="new-booking" className="panel space-y-3">
      <h2 id="new-booking" className="font-display text-lg font-extrabold">New booking</h2>
      <Form
        method="post"
        className="space-y-3"
        ref={formRef}
        onSubmit={(e) => localTimesToIso(e.currentTarget)}
      >
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="creativeUrl" value={image.url} />
        <input type="hidden" name="altText" value={image.alt} />
        <div>
          <label htmlFor="slotKey" className="label">Slot</label>
          <select id="slotKey" name="slotKey" className="field" value={slotKey} onChange={(e) => setSlotKey(e.target.value)}>
            {slots.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sponsorId" className="label">Sponsor</label>
          <select id="sponsorId" name="sponsorId" className="field" value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
            {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">+ New sponsor</option>
          </select>
        </div>
        {sponsorId === "new" ? (
          <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
            <div><label htmlFor="sponsorName" className="label">Sponsor name</label><input id="sponsorName" name="sponsorName" required maxLength={200} className="field" /></div>
            <div><label htmlFor="sponsorWebsite" className="label">Website (optional)</label><input id="sponsorWebsite" name="sponsorWebsite" type="url" placeholder="https://…" className="field" /></div>
            <p className="hint">Add contact details and vetting later on the <Link to="/sponsored" className="underline">Sponsored</Link> page.</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="startsAtLocal" className="label">Starts</label><input id="startsAtLocal" name="startsAtLocal" type="datetime-local" required className="field" /><input type="hidden" name="startsAt" /></div>
          <div><label htmlFor="endsAtLocal" className="label">Ends</label><input id="endsAtLocal" name="endsAtLocal" type="datetime-local" required className="field" /><input type="hidden" name="endsAt" /></div>
        </div>
        {slot ? (
          <div>
            <ImageField label="Ad image" url={image.url} alt={image.alt} onChange={setImage} ratio={aspectClass(slot)}
              hint={`Upload a ${slot.width} × ${slot.height} px image, or a larger one the same shape. The preview shows how it's cropped in the slot.`} />
            {image.url ? <p className="mt-1 text-xs text-muted">Readers see it labelled &ldquo;Advertisement from {sponsorName ?? "the new sponsor"}&rdquo;.</p> : null}
          </div>
        ) : null}
        <div>
          <label htmlFor="clickUrl" className="label">Click-through address</label>
          <input id="clickUrl" name="clickUrl" type="url" required className="field" placeholder="https://…" />
          <p className="hint">Must start with https://. Checked against the link safety list when you approve.</p>
        </div>
        {result && !result.ok ? <p role="alert" className="text-sm text-bad">{result.error}</p> : null}
        {result?.ok ? <p role="status" className="text-sm text-ok">Booking created. Approve it below to put it live.</p> : null}
        <button className="btn btn-primary w-full" disabled={busy || !image.url || !image.alt}>{busy ? "Saving…" : "Create booking"}</button>
        {!image.url ? <p className="hint text-center">Add the ad image to continue.</p> : null}
      </Form>
    </section>
  );
}
