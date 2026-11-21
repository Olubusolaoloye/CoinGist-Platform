import { readForm } from "~/lib/form.server";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { FOLLOW_TYPE_LABEL, postPath } from "@coingist/types";
import type { Route } from "./+types/account";
import { Pagination } from "~/components/Pagination";
import { SponsoredBadge } from "~/components/SponsoredBadge";
import { formatDate } from "~/lib/format";
import { privateHeaders } from "~/lib/private.server";
import { pageParam } from "~/lib/api.server";
import { assertSameOrigin, withReader } from "~/lib/reader.server";

export const headers = ({ loaderHeaders, actionHeaders }: Route.HeadersArgs) => (actionHeaders.has("Cache-Control") ? actionHeaders : loaderHeaders);

export function meta() {
  return [{ title: "Your account | CoinGist" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const page = pageParam(request);
  return withReader(request, async (api, auth) => {
    const [{ user }, saved, { follows }] = await Promise.all([api.me(), api.bookmarks(page), api.follows()]);
    return data({ email: user.email, name: user.name, saved, follows }, { headers: privateHeaders(auth.headers) });
  });
}

/** Plain-form actions on this page (work without JavaScript). */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const intent = form.get("intent");
  return withReader(request, async (api, auth) => {
    if (intent === "unsave") await api.unsave(String(form.get("postId")));
    else if (intent === "unfollow") await api.unfollow({ type: form.get("type") as "author", slug: String(form.get("slug")) });
    else if (intent === "clear") await api.clear();
    throw redirect(intent === "clear" ? "/account?cleared=1" : "/account", { headers: privateHeaders(auth.headers) });
  });
}

const FOLLOW_PATH = { author: "/author/", category: "/category/", tag: "/tag/" } as const;

export default function Account({ loaderData }: Route.ComponentProps) {
  const { email, name, saved, follows } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-10">
      <header className="border-b-2 border-ink pb-4">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">Your account</h1>
        <p className="mt-2 text-muted">Signed in as <strong className="text-ink">{name ?? email}</strong>{name ? ` (${email})` : ""}</p>
        <p className="mt-3"><Link to="/for-you" className="font-semibold text-link underline">Go to your feed</Link></p>
      </header>

      <section aria-labelledby="saved-h" className="mt-8">
        <h2 id="saved-h" className="font-display text-2xl font-extrabold tracking-tight">Saved stories <span className="text-base font-semibold text-muted">({saved.total})</span></h2>
        {saved.items.length === 0 ? (
          <p className="mt-3 text-muted">Nothing saved yet. Use the Save button on any story to read it later.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {saved.items.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  {s.isSponsored ? <SponsoredBadge sponsor={s.sponsorName} /> : null}
                  <Link to={postPath(s)} className="font-display text-lg leading-snug font-bold hover:underline">{s.title}</Link>
                  <p className="text-sm text-muted">{s.category?.name ?? s.type} · Saved {formatDate(s.savedAt)}</p>
                </div>
                <Form method="post">
                  <input type="hidden" name="postId" value={s.id} />
                  <button name="intent" value="unsave" disabled={busy} className="shrink-0 text-sm font-semibold text-link hover:underline">
                    Remove<span className="sr-only"> "{s.title}"</span>
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
        <Pagination path="/account" page={saved.page} pageSize={saved.pageSize} total={saved.total} />
      </section>

      <section aria-labelledby="following-h" className="mt-10">
        <h2 id="following-h" className="font-display text-2xl font-extrabold tracking-tight">Following</h2>
        {follows.length === 0 ? (
          <p className="mt-3 text-muted">You're not following anyone yet. Follow writers, topics and tags from their pages.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {follows.map((f) => (
              <li key={`${f.type}:${f.slug}`} className="flex items-center gap-2 rounded-full border border-line py-1 pr-1 pl-3 text-sm">
                <Link to={`${FOLLOW_PATH[f.type]}${f.slug}`} className="font-semibold hover:underline">{f.name}</Link>
                <span className="text-muted">{FOLLOW_TYPE_LABEL[f.type]}</span>
                <Form method="post">
                  <input type="hidden" name="type" value={f.type} />
                  <input type="hidden" name="slug" value={f.slug} />
                  <button name="intent" value="unfollow" disabled={busy} className="rounded-full px-2 py-1 hover:bg-line" aria-label={`Unfollow ${f.name}`}>✕</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="settings-h" className="mt-10 border-t border-line pt-6">
        <h2 id="settings-h" className="font-display text-2xl font-extrabold tracking-tight">Account</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Form method="post" action="/account/logout">
            <button className="rounded-md border border-line px-4 py-2.5 font-semibold hover:border-ink">Sign out</button>
          </Form>
          <Form method="post" onSubmit={(e) => { if (!window.confirm("Remove all your saved stories and follows? This can't be undone.")) e.preventDefault(); }}>
            <button name="intent" value="clear" className="rounded-md border border-line px-4 py-2.5 font-semibold text-bad hover:border-bad">Clear my saved stories and follows</button>
          </Form>
        </div>
        <p className="mt-3 text-sm text-muted">Newsletter subscriptions are separate: use the unsubscribe link in any email. To delete your account entirely, email the editors.</p>
      </section>
    </main>
  );
}
