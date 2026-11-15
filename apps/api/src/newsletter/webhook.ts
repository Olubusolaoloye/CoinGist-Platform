import { createHmac, timingSafeEqual } from "node:crypto";
import type { SubscriberStatus } from "@coingist/types";
import { mapBeehiivStatus } from "./beehiiv.js";

/**
 * Verifies a Svix-signed webhook (Beehiiv sends webhooks through Svix).
 * Signed content: `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256 with the
 * base64-decoded secret after the "whsec_" prefix. `svix-signature` holds one or more
 * space-separated "v1,<base64>" entries (several during secret rotation).
 */
export function verifySvixSignature(opts: {
  secret: string;
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { id, timestamp, signature, body } = opts;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  // Reject stale or future-dated messages (replay protection).
  if (!Number.isInteger(ts) || Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return false;

  const key = Buffer.from(opts.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface ProviderStatusEvent {
  externalId?: string;
  email?: string;
  status: SubscriberStatus;
}

/**
 * Pulls a subscriber status change out of a webhook payload, or null for events we ignore.
 * Tolerant of shape differences: VERIFY event names and fields against Beehiiv's docs.
 */
export function parseNewsletterEvent(payload: unknown): ProviderStatusEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { event_type?: unknown; type?: unknown; data?: Record<string, unknown> };
  const type = String(p.event_type ?? p.type ?? "");
  const data = p.data ?? {};
  const externalId = typeof data["id"] === "string" ? data["id"] : undefined;
  const email = typeof data["email"] === "string" ? data["email"] : undefined;
  if (!externalId && !email) return null;

  let status: SubscriberStatus | null = null;
  if (type === "subscription.deleted" || type === "subscription.unsubscribed") status = "unsubscribed";
  else if (type === "subscription.confirmed") status = "active";
  else if (type.startsWith("subscription.") && data["status"] !== undefined) status = mapBeehiivStatus(data["status"]);
  if (!status) return null;
  return { ...(externalId ? { externalId } : {}), ...(email ? { email } : {}), status };
}
