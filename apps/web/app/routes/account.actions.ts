import { data, redirect } from "react-router";
import { FollowInputSchema } from "@coingist/types";
import type { Route } from "./+types/account.actions";
import { privateHeaders } from "~/lib/private.server";
import { assertSameOrigin, getReader, readerApi, safeNext, signOut, SignedOut } from "~/lib/reader.server";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Save/unsave and follow/unfollow. Works as a plain form post (redirects back) and from the
 * page's JavaScript (fetcher; returns JSON).
 */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const back = safeNext(String(form.get("redirectTo") ?? ""));
  // The page's buttons send js=1 (they only exist after hydration); plain forms get a redirect.
  const isFetch = form.get("js") === "1";
  const done = (headers?: Headers) =>
    isFetch ? data({ ok: true as const }, { headers: privateHeaders(headers) }) : redirect(back, { headers: privateHeaders(headers) });
  const fail = (error: string, status: number) => data({ ok: false as const, error }, { status, headers: privateHeaders() });

  const auth = await getReader(request);
  if (!auth) throw redirect(`/account/login?next=${encodeURIComponent(back)}`);

  try {
    const api = readerApi(auth);
    if (intent === "save" || intent === "unsave") {
      const postId = String(form.get("postId") ?? "");
      if (!UUID.test(postId)) return fail("That story can't be saved.", 400);
      await (intent === "save" ? api.save(postId) : api.unsave(postId));
      return done(auth.headers);
    }
    if (intent === "follow" || intent === "unfollow") {
      const parsed = FollowInputSchema.safeParse({ type: form.get("type"), slug: form.get("slug") });
      if (!parsed.success) return fail("That can't be followed.", 400);
      await (intent === "follow" ? api.follow(parsed.data) : api.unfollow(parsed.data));
      return done(auth.headers);
    }
    return fail("Unknown action.", 400);
  } catch (err) {
    if (err instanceof SignedOut) throw redirect(`/account/login?expired=1&next=${encodeURIComponent(back)}`, { headers: await signOut(request) });
    // API errors (e.g. limits) arrive as data() responses with a readable message.
    if (err && typeof err === "object" && "data" in err && "init" in err) {
      const e = err as { data: { error?: string }; init: { status?: number } | null };
      return fail(e.data.error ?? "That didn't work. Try again.", e.init?.status ?? 400);
    }
    throw err;
  }
}

export function loader() {
  throw redirect("/account");
}
