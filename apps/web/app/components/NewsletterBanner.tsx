import type { SignupSource } from "@coingist/types";
import { NewsletterSignup } from "./NewsletterSignup";

/** Full-width signup band ("Stay in the loop"), used on the home and section pages. */
export function NewsletterBanner({ source }: { source: SignupSource }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-night px-6 py-8 text-night-ink sm:px-10">
      <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -bottom-16 hidden size-64 text-gist opacity-90 md:block">
        <circle cx="100" cy="100" r="80" fill="currentColor" />
        <circle cx="100" cy="100" r="52" fill="none" stroke="var(--night)" strokeWidth="14" />
      </svg>
      <div className="relative max-w-xl">
        <NewsletterSignup
          tone="inverse"
          source={source}
          heading="Stay in the loop"
          blurb="The five crypto stories that matter today, in a two-minute read. Free, every weekday morning."
        />
      </div>
    </div>
  );
}
