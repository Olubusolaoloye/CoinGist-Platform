import { data, Form, useNavigation } from "react-router";
import type { AdBooking, AdSlot, Sponsor } from "@coingist/types";
import type { Route } from "./+types/app.ads";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
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
  return data({ slots, bookings, sponsors, now: new Date().toISOString() }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = String(form.get("id") ?? "");
  let r;
  if (intent === "approve" || intent === "unapprove") r = await api.patch(`/v1/studio/ads/bookings/${id}`, { approved: intent === "approve" });
  else if (intent === "delete") r = await api.del(`/v1/studio/ads/bookings/${id}`);
  else
    r = await api.post("/v1/studio/ads/bookings", {
      slotKey: form.get("slotKey"),
      sponsorId: form.get("sponsorId"),
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? ""),
      creativeUrl: String(form.get("creativeUrl") ?? ""),
      clickUrl: String(form.get("clickUrl") ?? ""),
      altText: String(form.get("altText") ?? ""),
    });
  return r.ok ? data({ ok: true, error: null }) : data({ ok: false, error: r.message }, { status: r.status });
}

function state(b: AdBooking, now: string) {
  if (!b.approved) return { label: "Awaiting approval", cls: "text-warn" };
  if (b.endsAt <= now) return { label: "Ended", cls: "text-muted" };
  if (b.startsAt > now) return { label: "Scheduled", cls: "text-link" };
  return { label: "Live", cls: "text-ok font-semibold" };
}

export default function Ads({ loaderData, actionData }: Route.ComponentProps) {
  const { slots, bookings, sponsors, now } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold">Ads and newsletter sponsors</h1>
        <p className="mt-1 text-muted">Bookings go live only after an editor approves them. Approved bookings for one slot can't overlap.</p>
        {actionData?.error ? <p role="alert" className="mt-3 rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}
        {slots.map((slot) => {
          const list = bookings.filter((b) => b.slot.key === slot.key);
          return (
            <section key={slot.id} aria-labelledby={`slot-${slot.key}`} className="mt-6">
              <h2 id={`slot-${slot.key}`} className="font-display text-xl font-extrabold">{slot.name}</h2>
              <p className="text-sm text-muted">{slot.placement === "newsletter" ? "Newsletter placement" : "On the site"}, {slot.width} by {slot.height} pixels</p>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No bookings.{slot.placement === "home" ? " The site shows a newsletter promo here." : ""}</p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                  {list.map((b) => {
                    const s = state(b, now);
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                        <span className="font-semibold">{b.sponsor.name}</span>
                        <span className={s.cls}>{s.label}</span>
                        <span className="text-muted">{formatWhen(b.startsAt)} to {formatWhen(b.endsAt)}</span>
                        <span>{b.clicks} click{b.clicks === 1 ? "" : "s"}</span>
                        <span className="ml-auto flex gap-3">
                          <Form method="post"><input type="hidden" name="id" value={b.id} />
                            <button name="intent" value={b.approved ? "unapprove" : "approve"} className="font-semibold text-link hover:underline" disabled={busy}>{b.approved ? "Pause" : "Approve"}</button></Form>
                          <Form method="post" onSubmit={(e) => { if (!window.confirm("Delete this booking?")) e.preventDefault(); }}><input type="hidden" name="id" value={b.id} />
                            <button name="intent" value="delete" className="font-semibold text-bad hover:underline" disabled={busy}>Delete</button></Form>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <aside>
        <section aria-labelledby="new-booking" className="panel space-y-3">
          <h2 id="new-booking" className="font-display text-lg font-extrabold">New booking</h2>
          {sponsors.length === 0 ? <p className="text-sm text-muted">Add a sponsor on the Sponsored page first.</p> : (
            <Form method="post" className="space-y-3" onSubmit={(e) => {
              // datetime-local has no time zone: send the editor's local time as ISO.
              const f = e.currentTarget;
              for (const n of ["startsAt", "endsAt"]) {
                const local = f.elements.namedItem(`${n}Local`) as HTMLInputElement;
                (f.elements.namedItem(n) as HTMLInputElement).value = local.value ? new Date(local.value).toISOString() : "";
              }
            }}>
              <input type="hidden" name="intent" value="create" />
              <div><label htmlFor="slotKey" className="label">Slot</label>
                <select id="slotKey" name="slotKey" className="field">{slots.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></div>
              <div><label htmlFor="sponsorId" className="label">Sponsor</label>
                <select id="sponsorId" name="sponsorId" className="field">{sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="startsAtLocal" className="label">Starts</label><input id="startsAtLocal" name="startsAtLocal" type="datetime-local" required className="field" /><input type="hidden" name="startsAt" /></div>
                <div><label htmlFor="endsAtLocal" className="label">Ends</label><input id="endsAtLocal" name="endsAtLocal" type="datetime-local" required className="field" /><input type="hidden" name="endsAt" /></div>
              </div>
              <div><label htmlFor="creativeUrl" className="label">Image address</label><input id="creativeUrl" name="creativeUrl" required className="field" placeholder="https://…" /><p className="hint">Same proportions as the slot.</p></div>
              <div><label htmlFor="altText" className="label">Alt text</label><input id="altText" name="altText" required maxLength={300} className="field" /></div>
              <div><label htmlFor="clickUrl" className="label">Click-through address</label><input id="clickUrl" name="clickUrl" required className="field" placeholder="https://…" /><p className="hint">Check it on the link safety list first.</p></div>
              <button className="btn btn-primary w-full" disabled={busy}>Create booking</button>
            </Form>
          )}
        </section>
      </aside>
    </main>
  );
}
