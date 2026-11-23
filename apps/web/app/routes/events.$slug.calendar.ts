import type { Route } from "./+types/events.$slug.calendar";
import { api } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";

/** iCalendar text escaping (RFC 5545). */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** "Add to calendar": a one-event .ics file any calendar app can open. */
export async function loader({ params }: Route.LoaderArgs) {
  const l = await api.listing("event", params.slug);
  const site = siteConfig();
  const start = l.startsAt!;
  const end = l.endsAt ?? new Date(Date.parse(start) + 60 * 60_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoinGist//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${l.id}@coingist`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(l.title)}`,
    `DESCRIPTION:${esc(`${l.summary}\n\nOfficial page: ${l.url}\nMore on CoinGist: ${site.url}/events/${l.slug}`)}`,
    ...(l.location || l.isOnline ? [`LOCATION:${esc(l.location ?? "Online")}`] : []),
    `URL:${l.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${l.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
