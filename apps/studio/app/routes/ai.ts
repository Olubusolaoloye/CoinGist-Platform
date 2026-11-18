import { data } from "react-router";
import { AI_FEATURES, type AiStatus, type AiUsageEntry, type InternalLinkSuggestion } from "@coingist/types";
import type { Route } from "./+types/ai";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";

const UUID = /^[0-9a-f-]{36}$/i;

/** AI panel data for a story: status and quota, internal link ideas, and AI history. */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const headers = new Headers(auth.headers);
  headers.set("Cache-Control", "no-store");
  const postId = new URL(request.url).searchParams.get("postId");
  if (postId && UUID.test(postId)) {
    try {
      const panel = await api.get<{ status: AiStatus; links: InternalLinkSuggestion[]; usage: AiUsageEntry[] }>(`/v1/studio/ai/posts/${postId}/panel`);
      return data(panel, { headers });
    } catch {
      // AI is switched off (or the extras failed): fall back to the plain status below.
    }
  }
  const status = await api.get<AiStatus>("/v1/studio/ai/status");
  return data({ status, links: [] as InternalLinkSuggestion[], usage: [] as AiUsageEntry[] }, { headers });
}

/** Runs one AI feature. The browser never talks to the API or the model directly. */
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const form = await request.formData();
  const feature = String(form.get("feature") ?? "");
  if (!(AI_FEATURES as readonly string[]).includes(feature)) return data({ ok: false as const, feature, error: "Unknown AI feature." }, { status: 400 });
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return data({ ok: false as const, feature, error: "Couldn't read the request." }, { status: 400 });
  }
  const r = await studioApi(auth).post<{ result: unknown; provider: "claude" | "offline"; quota: AiStatus["quota"] }>(`/v1/studio/ai/${feature}`, payload);
  if (!r.ok) return data({ ok: false as const, feature, error: r.message }, { status: r.status, headers: auth.headers });
  return data({ ok: true as const, feature, ...r.data }, { headers: auth.headers });
}
