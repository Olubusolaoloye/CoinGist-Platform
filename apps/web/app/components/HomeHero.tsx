import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";

/** Opening band: what CoinGist is, and today's top story as a 30-second gist. */
export function HomeHero({ lead, bullets }: { lead: PostSummary | null; bullets: string[] }) {
  return (
    <section className="grid items-center gap-8 pt-8 pb-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-12">
      <div>
        <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-6xl">
          Crypto news with an African lens
        </h1>
        <p className="mt-4 max-w-[48ch] text-lg text-muted">
          The stories moving crypto and Web3 across the continent and beyond, explained in plain English. Get the gist in
          30 seconds, or read the full story.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#latest" className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper hover:opacity-90">
            Read the latest
          </a>
          <Link to="/newsletter" className="inline-flex min-h-12 items-center rounded-full border-2 border-ink px-6 font-semibold hover:bg-line">
            Get the Daily Gist
          </Link>
        </div>
      </div>

      {lead && bullets.length > 0 ? (
        <aside aria-labelledby="todays-gist" className="relative overflow-hidden rounded-2xl bg-gist p-6 text-gist-ink shadow-sm sm:p-8">
          <svg aria-hidden="true" viewBox="0 0 120 120" className="pointer-events-none absolute -top-8 -right-8 size-40 opacity-25">
            <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" />
            <circle cx="60" cy="60" r="22" fill="currentColor" />
          </svg>
          <h2 id="todays-gist" className="font-display text-lg font-extrabold">Today's gist in 30 seconds</h2>
          <p className="mt-3 font-display text-2xl leading-tight font-extrabold text-balance">
            <Link to={postPath(lead)} className="hover:underline">{lead.title}</Link>
          </p>
          <ul className="mt-4 space-y-2">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-gist-ink" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link to={postPath(lead)} className="mt-5 inline-flex font-semibold underline underline-offset-4">
            Read the full story
          </Link>
        </aside>
      ) : null}
    </section>
  );
}
