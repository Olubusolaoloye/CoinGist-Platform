import { data, redirect } from "react-router";
import { CommentInputBodySchema, DisplayNameSchema } from "@coingist/types";
import type { Route } from "./+types/engagement";
import { api } from "~/lib/api.server";
import { readForm } from "~/lib/form.server";
import { privateHeaders } from "~/lib/private.server";
import { allow, clientIp } from "~/lib/ratelimit.server";
import { assertSameOrigin, getReader, readerApi, safeNext, signOut, SignedOut } from "~/lib/reader.server";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A story's likes and comments, loaded by the browser after the (cached) page renders, plus
 * what the signed-in reader has liked and who they are. Never cached.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const postId = new URL(request.url).searchParams.get("postId") ?? "";
  if (!UUID.test(postId)) throw data(null, { status: 404 });
  const auth = await getReader(request);
  const story = await api.engagement(postId);
  if (!auth) return data({ ...story, me: null, liked: null }, { headers: privateHeaders() });
  try {
    const reader = readerApi(auth);
    const [{ user }, liked] = await Promise.all([reader.me(), reader.myEngagement(postId)]);
    return data({ ...story, me: { id: user.id, name: user.name }, liked }, { headers: privateHeaders(auth.headers) });
  } catch (err) {
    if (err instanceof SignedOut) return data({ ...story, me: null, liked: null }, { headers: privateHeaders(await signOut(request)) });
    throw err;
  }
}

export type EngagementResult = { ok: true; likes?: number } | { ok: false; error: string };

/** Comment, reply, edit, delete, like, report, and set the name shown on comments. */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const intent = String(form.get("intent") ?? "");
  const back = safeNext(String(form.get("redirectTo") ?? "/"));
  const fail = (error: string, status = 400) => data<EngagementResult>({ ok: false, error }, { status, headers: privateHeaders() });

  const auth = await getReader(request);
  if (!auth) throw redirect(`/account/login?next=${encodeURIComponent(back)}`);
  // A second, generous limit in front of the database's own per-account limit.
  if (!allow(`engage:${clientIp(request)}`, 60, 60_000)) return fail("Too many actions. Wait a minute and try again.", 429);

  const id = String(form.get("id") ?? "");
  const postId = String(form.get("postId") ?? "");
  const ok = (likes?: number) => data<EngagementResult>(likes === undefined ? { ok: true } : { ok: true, likes }, { headers: privateHeaders(auth.headers) });
  const body = () => CommentInputBodySchema.safeParse(form.get("body") ?? "");

  try {
    const reader = readerApi(auth);
    switch (intent) {
      case "comment": {
        const b = body();
        if (!b.success) return fail(b.error.issues[0]?.message ?? "Check your comment.");
        if (!UUID.test(postId)) return fail("That story can't take comments.");
        const parentId = String(form.get("parentId") ?? "");
        await reader.comment(postId, b.data, UUID.test(parentId) ? parentId : undefined);
        return ok();
      }
      case "edit": {
        const b = body();
        if (!b.success) return fail(b.error.issues[0]?.message ?? "Check your comment.");
        if (!UUID.test(id)) return fail("Comment not found.", 404);
        await reader.editComment(id, b.data);
        return ok();
      }
      case "delete":
        if (!UUID.test(id)) return fail("Comment not found.", 404);
        await reader.deleteComment(id);
        return ok();
      case "like-post":
      case "unlike-post":
        if (!UUID.test(postId)) return fail("Story not found.", 404);
        return ok((await reader.likePost(postId, intent === "like-post")).likes);
      case "like-comment":
      case "unlike-comment":
        if (!UUID.test(id)) return fail("Comment not found.", 404);
        return ok((await reader.likeComment(id, intent === "like-comment")).likes);
      case "report":
        if (!UUID.test(id)) return fail("Comment not found.", 404);
        await reader.report(id, String(form.get("reason") ?? "").slice(0, 300));
        return ok();
      case "name": {
        const n = DisplayNameSchema.safeParse({ name: form.get("name") });
        if (!n.success) return fail(n.error.issues[0]?.message ?? "Enter a name.");
        await reader.setName(n.data.name);
        return ok();
      }
      default:
        return fail("Unknown action.");
    }
  } catch (err) {
    if (err instanceof SignedOut) throw redirect(`/account/login?expired=1&next=${encodeURIComponent(back)}`, { headers: await signOut(request) });
    if (err && typeof err === "object" && "data" in err && "init" in err) {
      const e = err as { data: { error?: string }; init: { status?: number } | null };
      const msg = e.data.error ?? "That didn't work. Try again.";
      return fail(msg.charAt(0).toUpperCase() + msg.slice(1), e.init?.status ?? 400);
    }
    throw err;
  }
}
