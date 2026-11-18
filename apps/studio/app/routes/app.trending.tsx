import { data, Form, Link, useNavigation } from "react-router";
import type { AiQuota, AiStatus, TrendingDigest } from "@coingist/types";
import type { Route } from "./+types/app.trending";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Trending digest | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const me = await api.me();
  if (!me.permissions.includes("post:review")) throw data({ error: "The trending digest is for editors." }, { status: 403 });
  const status = await api.get<AiStatus>("/v1/studio/ai/status");
  return data({ status }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const form = await request.formData();
  const r = await studioApi(auth).post<{ result: TrendingDigest; provider: "claude" | "offline"; quota: AiQuota }>("/v1/studio/ai/trending", {
    notes: String(form.get("notes") ?? ""),
  });
  if (!r.ok) return data({ error: r.message, digest: null, provider: null, quota: null }, { status: r.status, headers: auth.headers });
  return data({ error: null, digest: r.data.result, provider: r.data.provider, quota: r.data.quota }, { headers: auth.headers });
}

export default function Trending({ loaderData, actionData }: Route.ComponentProps) {
  const { status } = loaderData;
  const busy = useNavigation().state === "submitting";
  const digest = actionData?.digest ?? null;
  const quota = actionData?.quota ?? status.quota;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Trending digest</h1>
      <p className="mt-1 max-w-3xl text-muted">
        AI groups the latest headlines from our news feeds into topics worth covering, with an angle for CoinGist readers, and flags what we've already covered.
        It's a starting point for the desk, not a source: open the original stories before assigning anything.
      </p>

      {!status.provider ? (
        <p className="panel mt-6 text-sm">AI assist isn't set up on this server. Ask an admin to add an Anthropic API key.</p>
      ) : (
        <Form method="post" className="panel mt-6 space-y-3">
          <div>
            <label htmlFor="notes" className="label">Anything else on your radar? <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="notes" name="notes" rows={3} maxLength={5000} className="field" placeholder="e.g. readers asking about the new exchange rules in Kenya" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={busy || quota?.remaining === 0}>{busy ? "Reading the feeds…" : "Build the digest"}</button>
            {quota ? <span className="text-sm text-muted">{quota.remaining} of {quota.limit} AI requests left today</span> : null}
          </div>
          {status.provider === "offline" ? <p className="text-xs text-warn">Sample mode: no AI model is connected, so topics are just the headlines.</p> : null}
        </Form>
      )}

      {actionData?.error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}

      {digest ? (
        <section aria-labelledby="topics-h" className="mt-8">
          <h2 id="topics-h" className="font-display text-xl font-extrabold">Topics</h2>
          <p className="text-sm text-muted">
            {`${digest.headlineCount
              ? `From ${digest.headlineCount} headline${digest.headlineCount === 1 ? "" : "s"}${digest.sources.length ? ` (${digest.sources.join(", ")})` : ""}`
              : "From your notes (no feed headlines)"}, ${formatWhen(digest.generatedAt)}.`}
          </p>
          {digest.topics.length === 0 ? <p className="panel mt-3 text-sm">No topics stood out.</p> : (
            <ol className="mt-3 space-y-4">
              {digest.topics.map((t, i) => (
                <li key={i} className="panel">
                  <h3 className="font-display text-lg font-extrabold">{t.title}</h3>
                  <p className="mt-1 text-sm"><span className="font-semibold">Why it matters:</span> {t.whyItMatters}</p>
                  <p className="mt-1 text-sm"><span className="font-semibold">Our angle:</span> {t.angle}</p>
                  {t.sourceLinks.length ? (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {t.sourceLinks.map((l) => (
                        <li key={l}><a href={l} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-link underline">{new URL(l).hostname.replace(/^www\./, "")}<span className="sr-only"> (opens in a new tab)</span></a></li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    {t.coveredBy ? (
                      <span className="text-muted">Already covered: <Link to={`/posts/${t.coveredBy.id}`} className="text-link underline">{t.coveredBy.title}</Link></span>
                    ) : null}
                    <Link to={`/posts/new?title=${encodeURIComponent(t.suggestedHeadline)}`} className="btn">Start a story: “{t.suggestedHeadline}”</Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </main>
  );
}
