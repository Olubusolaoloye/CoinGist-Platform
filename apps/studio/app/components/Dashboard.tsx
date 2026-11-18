import type { ReactNode } from "react";
import { Link } from "react-router";
import type { StudioPostSummary } from "@coingist/types";
import { age, ago, formatShortDate } from "~/lib/format";

/** One headline number. `to` makes the whole tile a link. */
export function StatTile({ label, value, detail, to, tone }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  to?: string;
  tone?: "warn" | "bad";
}) {
  // The label is the link, stretched over the whole tile, so the tile stays a valid <dl> group.
  return (
    <div className={`panel relative ${to ? "hover:border-ink" : ""}`}>
      <dt className="text-sm text-muted">
        {to ? <Link to={to} className="after:absolute after:inset-0 after:rounded-lg hover:underline">{label}</Link> : label}
      </dt>
      <dd className={`font-display font-extrabold ${typeof value === "string" && value.length > 12 ? "text-xl leading-tight" : "text-3xl"} ${tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : ""}`}>{value}</dd>
      {detail ? <dd className="text-sm text-muted">{detail}</dd> : null}
    </div>
  );
}

/** A titled panel with an optional "see all" link. */
export function Card({ id, title, action, children, className = "" }: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`panel min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-lg font-extrabold">{title}</h2>
        {action ? <div className="text-sm">{action}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Compact story list: title, writer, and how long it has been waiting. */
export function PostList({ posts, now, empty, since }: {
  posts: StudioPostSummary[];
  now: string;
  empty: string;
  /** e.g. "Waiting"; reads "Waiting 3 days". Without it: "Updated 3 days ago". */
  since?: string;
}) {
  if (posts.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {posts.map((p) => (
        <li key={p.id} className="py-2 first:pt-0 last:pb-0">
          <Link to={`/posts/${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
          <p className="text-sm text-muted">
            {p.author.name ?? "Unknown writer"} · <span className="capitalize">{p.type}</span> · {since ? `${since} ${age(p.updatedAt, now)}` : `Updated ${ago(p.updatedAt, now)}`}
            {p.openComments ? ` · ${p.openComments} open comment${p.openComments === 1 ? "" : "s"}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Single-series column chart (one bar per day). Each bar has a hover title and the same
 * numbers are available as a table, so the chart never relies on sight alone.
 */
export function DailyBars({ data, label }: { data: Array<{ date: string; count: number }>; label: string }) {
  const peak = Math.max(0, ...data.map((d) => d.count));
  const max = Math.max(1, peak);
  const total = data.reduce((n, d) => n + d.count, 0);
  const W = 600, H = 120, gap = 2;
  const bw = W / data.length - gap;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label={`${label}: ${total} in total`}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" strokeWidth="1" />
        {data.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(4, (d.count / max) * (H - 24));
          const x = i * (bw + gap);
          return (
            <g key={d.date}>
              {/* Hit target taller than the bar, so small days are easy to hover. */}
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent">
                <title>{`${formatShortDate(d.date)}: ${d.count} ${d.count === 1 ? "story" : "stories"}`}</title>
              </rect>
              {h > 0 ? (
                <path
                  d={`M${x},${H} v${-(h - 3)} q0,-3 3,-3 h${bw - 6} q3,0 3,3 v${h - 3} z`}
                  fill="var(--link)"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}
        <text x="0" y={H + 14} fontSize="11" fill="var(--muted)">{formatShortDate(data[0]!.date)}</text>
        <text x={W} y={H + 14} fontSize="11" fill="var(--muted)" textAnchor="end">{formatShortDate(data.at(-1)!.date)}</text>
        <text x={W} y="10" fontSize="11" fill="var(--muted)" textAnchor="end">Most in a day: {peak}</text>
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-link">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr className="text-muted"><th scope="col" className="font-semibold">Day</th><th scope="col" className="text-right font-semibold">Published</th></tr></thead>
          <tbody>
            {data.filter((d) => d.count > 0).map((d) => (
              <tr key={d.date}><td>{formatShortDate(d.date)}</td><td className="text-right tabular-nums">{d.count}</td></tr>
            ))}
            {total === 0 ? <tr><td colSpan={2} className="text-muted">Nothing published in this period.</td></tr> : null}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars with the label and number written out (no legend needed). */
export function LabelledBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[6rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
          <span className="truncate capitalize">{r.label}</span>
          <span className="h-3 rounded-r bg-line" aria-hidden="true">
            <span className="block h-3 rounded-r bg-link" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
