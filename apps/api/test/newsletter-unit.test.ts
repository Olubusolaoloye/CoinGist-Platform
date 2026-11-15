import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBeehiivProvider, mapBeehiivStatus } from "../src/newsletter/beehiiv.js";
import { ProviderError } from "../src/newsletter/provider.js";
import { parseNewsletterEvent, verifySvixSignature } from "../src/newsletter/webhook.js";

describe("Beehiiv client", () => {
  const make = (respond: (req: Request) => Response | Promise<Response>) => {
    const seen: Request[] = [];
    const provider = createBeehiivProvider({
      apiKey: "key_123",
      publicationId: "pub_abc",
      siteUrl: "https://coingist.test",
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const req = new Request(input, init);
        seen.push(req.clone());
        return respond(req);
      }) as typeof fetch,
    });
    return { provider, seen };
  };

  it("posts the subscription with auth, lists and source", async () => {
    const { provider, seen } = make(() => Response.json({ data: { id: "sub_1", status: "validating" } }, { status: 201 }));
    const out = await provider.subscribe({ email: "ada@example.com", lists: ["daily-gist", "weekly-wrap"], source: "footer", reactivate: true });
    expect(out).toEqual({ externalId: "sub_1", status: "pending" });
    const req = seen[0]!;
    expect(req.url).toBe("https://api.beehiiv.com/v2/publications/pub_abc/subscriptions");
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe("Bearer key_123");
    expect(await req.json()).toMatchObject({
      email: "ada@example.com",
      reactivate_existing: true,
      utm_medium: "footer",
      custom_fields: [{ name: "lists", value: "daily-gist,weekly-wrap" }],
    });
  });

  it("marks 429/5xx and network errors retryable, 4xx not", async () => {
    for (const [status, retryable] of [[429, true], [503, true], [400, false], [401, false]] as const) {
      const { provider } = make(() => new Response("nope", { status }));
      const err = await provider.subscribe({ email: "a@b.co", lists: ["daily-gist"], source: "x", reactivate: false }).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable, String(status)).toBe(retryable);
    }
    const { provider } = make(() => Promise.reject(new TypeError("fetch failed")));
    expect(await provider.subscribe({ email: "a@b.co", lists: ["daily-gist"], source: "x", reactivate: false }).catch((e) => (e as ProviderError).retryable)).toBe(true);
  });

  it("maps statuses conservatively", () => {
    expect(mapBeehiivStatus("active")).toBe("active");
    expect(mapBeehiivStatus("inactive")).toBe("unsubscribed");
    expect(mapBeehiivStatus("invalid")).toBe("bounced");
    expect(mapBeehiivStatus("needs_attention")).toBe("pending");
    expect(mapBeehiivStatus(undefined)).toBe("pending");
  });
});

describe("Svix webhook signatures", () => {
  const secret = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
  const sign = (id: string, ts: number, body: string, s = secret) =>
    `v1,${createHmac("sha256", Buffer.from(s.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const now = 1_800_000_000;
  const body = '{"event_type":"subscription.confirmed"}';

  it("accepts a valid signature, including among rotated ones", () => {
    const sig = sign("msg_1", now, body);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: String(now), signature: sig, body, nowSeconds: now })).toBe(true);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: String(now), signature: `v1,AAAA ${sig}`, body, nowSeconds: now })).toBe(true);
  });

  it("rejects tampering, wrong secrets, replays and missing headers", () => {
    const sig = sign("msg_1", now, body);
    const base = { secret, id: "msg_1", timestamp: String(now), signature: sig, body, nowSeconds: now };
    expect(verifySvixSignature({ ...base, body: body.replace("confirmed", "deleted") })).toBe(false);
    expect(verifySvixSignature({ ...base, id: "msg_2" })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: sign("msg_1", now, body, `whsec_${Buffer.from("other-secret-other-secret-123456").toString("base64")}`) })).toBe(false);
    expect(verifySvixSignature({ ...base, nowSeconds: now + 301 })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: sig.replace("v1,", "v2,") })).toBe(false);
  });
});

describe("parseNewsletterEvent", () => {
  it("understands confirmations, unsubscribes and status updates", () => {
    expect(parseNewsletterEvent({ event_type: "subscription.confirmed", data: { id: "sub_1", email: "a@b.co" } })).toEqual({ externalId: "sub_1", email: "a@b.co", status: "active" });
    expect(parseNewsletterEvent({ event_type: "subscription.deleted", data: { id: "sub_1" } })).toEqual({ externalId: "sub_1", status: "unsubscribed" });
    expect(parseNewsletterEvent({ type: "subscription.updated", data: { id: "sub_1", status: "invalid" } })).toEqual({ externalId: "sub_1", status: "bounced" });
  });

  it("ignores other events and junk", () => {
    expect(parseNewsletterEvent({ event_type: "post.sent", data: { id: "p1" } })).toBeNull();
    expect(parseNewsletterEvent({ event_type: "subscription.confirmed", data: {} })).toBeNull();
    expect(parseNewsletterEvent("nope")).toBeNull();
  });
});
