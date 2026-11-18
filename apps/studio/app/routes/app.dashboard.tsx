import { data, Link } from "react-router";
import type { EditorDashboard } from "@coingist/types";
import type { Route } from "./+types/app.dashboard";
import { Card, DailyBars, LabelledBars, PostList, StatTile } from "~/components/Dashboard";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { age, ago, formatDay, formatShortDate } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Editor dashboard | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const from = new URL(request.url).searchParams.get("from");
  const qs = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? `?from=${from}` : "";
  const { dashboard } = await studioApi(auth).get<{ dashboard: EditorDashboard }>(`/v1/studio/dashboard${qs}`);
  return data({ dashboard, now: new Date().toISOString() }, { headers: auth.headers });
}

const shiftWeeks = (ymd: string, weeks: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + weeks * 7 * 86_400_000).toISOString().slice(0, 10);

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default function EditorDashboardPage({ loaderData }: Route.ComponentProps) {
  const { dashboard: d, now } = loaderData;
  const today = now.slice(0, 10);
  const published30d = d.publishedByDay.reduce((n, x) => n + x.count, 0);
  const oldest = d.reviewQueue[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Editor dashboard</h1>
      <p className="mt-1 text-muted">What needs you now, what's going out, and how the desk is doing. Times are UTC.</p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Waiting for review"
          value={d.counts.in_review}
          detail={oldest ? `Oldest has waited ${age(oldest.updatedAt, now)}` : "Queue is clear"}
          to="/review"
          {...(oldest && Date.parse(now) - Date.parse(oldest.updatedAt) > 86_400_000 ? { tone: "warn" as const } : {})}
        />
        <StatTile label="Ready to schedule" value={d.counts.approved} detail="Approved, not yet scheduled" to="/posts?status=approved" />
        <StatTile label="Scheduled" value={d.counts.scheduled} detail="Will publish automatically" to="/posts?status=scheduled" />
        <StatTile label="Published, last 30 days" value={published30d} detail={`${d.counts.changes_requested} with writers for changes`} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card id="queue-h" title="Review queue" action={<Link to="/review" className="font-semibold text-link hover:underline">Open queue</Link>}>
          <PostList posts={d.reviewQueue} now={now} since="Waiting" empty="Nothing waiting. Your own submissions go to another editor." />
        </Card>
        <Card id="ready-h" title="Ready to schedule">
          <PostList posts={d.readyToSchedule} now={now} empty="No approved stories waiting for a slot." />
        </Card>
        <Card id="stalled-h" title="Stalled">
          <PostList posts={d.stalled} now={now} since="Untouched for" empty="No drafts have stalled for more than a week." />
        </Card>
      </div>

      <section aria-labelledby="cal-h" className="panel mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="cal-h" className="font-display text-lg font-extrabold">Editorial calendar</h2>
          <nav aria-label="Calendar weeks" className="flex gap-2 text-sm">
            <Link className="btn" to={`?from=${shiftWeeks(d.calendar.from, -1)}`}>Previous week</Link>
            <Link className="btn" to="?">This week</Link>
            <Link className="btn" to={`?from=${shiftWeeks(d.calendar.from, 1)}`}>Next week</Link>
          </nav>
        </div>
        <p className="mt-1 text-sm text-muted">
          Two weeks from {formatShortDate(d.calendar.from)}. Scheduled stories publish on their own; published ones are shown for reference.
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {d.calendar.days.map((day) => (
            <li
              key={day.date}
              aria-label={`${formatDay(day.date)}${day.date === today ? ", today" : ""}: ${day.entries.length} ${day.entries.length === 1 ? "story" : "stories"}`}
              className={`min-h-24 rounded-md border p-2 ${day.date === today ? "border-link" : "border-line"}`}
            >
              <p className={`text-xs font-semibold ${day.date === today ? "text-link" : "text-muted"}`}>
                {formatDay(day.date)}{day.date === today ? " · Today" : ""}
              </p>
              <ul className="mt-1 space-y-1">
                {day.entries.map((e) => (
                  <li key={e.id} className="text-sm leading-snug">
                    <Link to={`/posts/${e.id}`} className="hover:underline">
                      <span className={`mr-1 inline-block rounded px-1 text-[0.68rem] font-bold uppercase ${e.status === "scheduled" ? "border border-ok text-ok" : "bg-gist text-gist-ink"}`}>
                        {e.status === "scheduled" ? "Sched" : "Live"}
                      </span>
                      <span className="font-semibold">{e.title}</span>
                    </Link>
                    <span className="block text-xs text-muted">{TIME.format(new Date(e.at))} · {e.author.name ?? "Unknown"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card id="pace-h" title="Published per day, last 30 days">
          <DailyBars data={d.publishedByDay} label="Stories published per day over the last 30 days" />
        </Card>
        <Card id="mix-h" title="Section mix, last 30 days">
          {d.sectionMix.length ? (
            <LabelledBars rows={d.sectionMix.map((s) => ({ label: s.type, value: s.count }))} />
          ) : (
            <p className="text-sm text-muted">Nothing published in the last 30 days.</p>
          )}
        </Card>
      </div>

      <Card id="writers-h" title="Writers" className="mt-6">
        {d.writers.length === 0 ? (
          <p className="text-sm text-muted">No writers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 font-semibold">Writer</th>
                  <th scope="col" className="py-1 text-right font-semibold">Drafts</th>
                  <th scope="col" className="py-1 text-right font-semibold">In review</th>
                  <th scope="col" className="py-1 text-right font-semibold">Changes requested</th>
                  <th scope="col" className="py-1 text-right font-semibold">Published (30 days)</th>
                  <th scope="col" className="py-1 text-right font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.writers.map((w) => (
                  <tr key={w.id}>
                    <th scope="row" className="py-2 font-semibold">
                      {w.name ?? "Unnamed"} {w.role !== "writer" ? <span className="font-normal text-muted capitalize">({w.role})</span> : null}
                    </th>
                    <td className="text-right tabular-nums">{w.drafts}</td>
                    <td className="text-right tabular-nums">{w.inReview}</td>
                    <td className={`text-right tabular-nums ${w.changesRequested ? "text-warn font-semibold" : ""}`}>{w.changesRequested}</td>
                    <td className="text-right font-semibold tabular-nums">{w.published30d}</td>
                    <td className="text-right text-muted">{w.lastActiveAt ? ago(w.lastActiveAt, now) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
