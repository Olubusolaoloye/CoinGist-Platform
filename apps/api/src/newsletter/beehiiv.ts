import type { SubscriberStatus } from "@coingist/types";
import { ProviderError, type NewsletterProvider } from "./provider.js";

/**
 * Beehiiv API v2.
 * Endpoint: POST https://api.beehiiv.com/v2/publications/{publicationId}/subscriptions
 *
 * VERIFY BEFORE LAUNCH: only `email` is confirmed as the required field from Beehiiv's
 * reference. `reactivate_existing`, `send_welcome_email`, `utm_*` and `custom_fields` come from
 * third-party documentation. The "lists" custom field must exist in the Beehiiv publication;
 * build Beehiiv segments on it.
 */
export function createBeehiivProvider(opts: {
  apiKey: string;
  publicationId: string;
  siteUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): NewsletterProvider {
  const doFetch = opts.fetch ?? fetch;
  const url = `https://api.beehiiv.com/v2/publications/${encodeURIComponent(opts.publicationId)}/subscriptions`;

  return {
    name: "beehiiv",
    async subscribe({ email, lists, source, reactivate }) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            email,
            reactivate_existing: reactivate,
            send_welcome_email: true,
            utm_source: "coingist",
            utm_medium: source,
            referring_site: opts.siteUrl,
            custom_fields: [{ name: "lists", value: lists.join(",") }],
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
      } catch (err) {
        throw new ProviderError(`Beehiiv unreachable: ${(err as Error).message}`, true);
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new ProviderError(`Beehiiv HTTP ${res.status}: ${detail}`, res.status === 429 || res.status >= 500);
      }
      const json = (await res.json().catch(() => null)) as { data?: { id?: unknown; status?: unknown } } | null;
      const id = json?.data?.id;
      if (typeof id !== "string" || !id) throw new ProviderError("Beehiiv response had no subscription id", true);
      return { externalId: id, status: mapBeehiivStatus(json?.data?.status) };
    },
  };
}

/** Beehiiv subscription status → ours. Unknown values stay pending (safe: never auto-mails). */
export function mapBeehiivStatus(status: unknown): SubscriberStatus {
  switch (status) {
    case "active":
      return "active";
    case "inactive":
      return "unsubscribed";
    case "invalid":
      return "bounced";
    default: // validating, pending, needs_attention, unknown
      return "pending";
  }
}
