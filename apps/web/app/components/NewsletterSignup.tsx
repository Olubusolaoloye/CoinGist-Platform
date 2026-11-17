import { useEffect, useId, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { NEWSLETTER_LIST_INFO, NEWSLETTER_LISTS, type SignupSource } from "@coingist/types";
import { track } from "~/lib/analytics";
import type { SubscribeResult } from "~/lib/api.server";

/** Hidden from people (and screen readers); bots fill it in. */
function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

function Result({ result, inverse = false }: { result: SubscribeResult | undefined; inverse?: boolean }) {
  const error = inverse ? "font-semibold text-gist" : "font-semibold text-bad";
  return (
    <p role="status" className={`min-h-6 text-sm ${result?.ok === false ? error : ""}`}>
      {result?.message ?? ""}
    </p>
  );
}

/**
 * Compact signup (footer, end of articles): Daily Gist only. Works without JavaScript by
 * posting to /newsletter, which shows the result.
 */
export function NewsletterSignup({
  source,
  heading = "Get the Daily Gist",
  blurb = NEWSLETTER_LIST_INFO["daily-gist"].description,
  tone = "plain",
}: {
  source: SignupSource;
  heading?: string;
  blurb?: string;
  /** "inverse": light text for dark backgrounds. */
  tone?: "plain" | "boxed" | "inverse";
}) {
  const fetcher = useFetcher<SubscribeResult>();
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      form.current?.reset();
      track("Newsletter Signup", { source });
    }
  }, [fetcher.state, fetcher.data, source]);
  const busy = fetcher.state !== "idle";
  const inverse = tone === "inverse";
  const subtle = inverse ? "text-night-muted" : "text-muted";

  return (
    <section aria-labelledby={`${id}-h`} className={tone === "boxed" ? "rounded-md border-2 border-ink p-5" : ""}>
      <h2 id={`${id}-h`} className={`font-display font-extrabold ${inverse ? "text-3xl" : "text-xl"}`}>{heading}</h2>
      <p className={`mt-1 max-w-[52ch] text-sm ${subtle}`}>{blurb}</p>
      <fetcher.Form ref={form} method="post" action="/newsletter" className="relative mt-3">
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="lists" value="daily-gist" />
        <Honeypot />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-ink placeholder:text-muted sm:max-w-80"
          />
          <button
            className={`min-h-11 shrink-0 rounded-md px-5 font-semibold hover:opacity-90 disabled:opacity-60 ${inverse ? "bg-gist text-gist-ink" : "bg-ink text-paper"}`}
            disabled={busy}
          >
            {busy ? "Subscribing…" : "Subscribe"}
          </button>
        </div>
        <p className={`mt-2 text-xs ${subtle}`}>
          Free. Unsubscribe any time. See <Link to="/newsletter" className="underline">both newsletters</Link>.
        </p>
        <Result result={fetcher.data} inverse={inverse} />
      </fetcher.Form>
    </section>
  );
}

/** Full form on /newsletter: choose lists. */
export function NewsletterForm({ result, busy }: { result: SubscribeResult | undefined; busy: boolean }) {
  return (
    <>
      <fieldset>
        <legend className="font-display text-lg font-extrabold">Choose your newsletters</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {NEWSLETTER_LISTS.map((list, i) => {
            const info = NEWSLETTER_LIST_INFO[list];
            return (
              <label key={list} className="flex cursor-pointer gap-3 rounded-md border border-line bg-surface p-4 has-[:checked]:border-ink has-[:focus-visible]:outline-2">
                <input type="checkbox" name="lists" value={list} defaultChecked={i === 0} className="mt-1 size-4 accent-[var(--ink)]" />
                <span>
                  <span className="block font-display text-lg font-bold">{info.name}</span>
                  <span className="block text-sm font-semibold text-link">{info.cadence}</span>
                  <span className="mt-1 block text-sm text-muted">{info.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <input type="hidden" name="source" value="newsletter-page" />
      <Honeypot />
      <div className="mt-5">
        <label htmlFor="nl-email" className="block font-semibold">Email address</label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input id="nl-email" name="email" type="email" required autoComplete="email"
            className="min-h-12 w-full rounded-md border border-line bg-surface px-3 text-lg text-ink sm:max-w-96" />
          <button className="min-h-12 shrink-0 rounded-md bg-gist px-6 font-semibold text-gist-ink hover:opacity-90 disabled:opacity-60" disabled={busy}>
            {busy ? "Subscribing…" : "Subscribe"}
          </button>
        </div>
      </div>
      <div className="mt-3"><Result result={result} /></div>
    </>
  );
}
