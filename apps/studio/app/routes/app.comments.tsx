import { data, Form, Link, useNavigation } from "react-router";
import { MODERATION_FILTERS, type ModerationComment, type ModerationFilter } from "@coingist/types";
import type { Route } from "./+types/app.comments";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { formatWhen } from "~/lib/format";
import { readForm } from "~/lib/form.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Comments | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const raw = new URL(request.url).searchParams.get("filter");
  const filter: ModerationFilter = (MODERATION_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as ModerationFilter) : "reported";
  const { comments } = await studioApi(auth).get<{ comments: ModerationComment[] }>(`/v1/studio/reader-comments?filter=${filter}`);
  return data({ comments, filter, siteUrl: env.siteUrl }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await readForm(request);
  const id = String(form.get("id") ?? "");
  const intent = form.get("intent");
  const r =
    intent === "delete"
      ? await api.del(`/v1/studio/reader-comments/${id}`)
      : await api.patch(`/v1/studio/reader-comments/${id}`, { hidden: intent === "hide" });
  if (!r.ok) return data({ error: r.message, message: null }, { status: r.status, headers: auth.headers });
  const message = intent === "delete" ? "Comment deleted." : intent === "hide" ? "Comment hidden from readers." : "Comment restored and its reports cleared.";
  return data({ error: null, message }, { headers: auth.headers });
}

const TABS: Array<{ filter: ModerationFilter; label: string }> = [
  { filter: "reported", label: "Reported" },
  { filter: "hidden", label: "Hidden" },
  { filter: "all", label: "All recent" },
];

export default function Comments({ loaderData, actionData }: Route.ComponentProps) {
  const { comments, filter, siteUrl } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="space-y-5 px-3 py-6 sm:px-5">
      <header>
        <p className="eyebrow">Newsroom</p>
        <h1 className="font-display text-3xl font-extrabold">Reader comments</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Comments go live straight away. A comment reported by three readers is hidden until you look at it. Hide anything that&rsquo;s spam,
          abuse or a scam; to stop someone commenting, suspend their account on Team and roles (admins).
        </p>
      </header>

      <nav aria-label="Filter comments" className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.filter} to={`?filter=${t.filter}`} aria-current={filter === t.filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${filter === t.filter ? "border-ink bg-ink text-paper" : "border-line"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div role="status" className="min-h-6 text-sm">{actionData?.message ? <p className="text-ok">{actionData.message}</p> : null}</div>
      {actionData?.error ? <p role="alert" className="rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}

      {comments.length === 0 ? (
        <p className="panel text-muted">{filter === "reported" ? "No reported comments. All clear." : filter === "hidden" ? "No hidden comments." : "No comments yet."}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="panel space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{c.author.name}</span>
                <span className="text-muted">{c.author.email}</span>
                {c.author.status === "suspended" ? <span className="font-semibold text-bad">Suspended</span> : null}
                <span className="text-muted">{formatWhen(c.createdAt)}</span>
                {c.status === "hidden" ? (
                  <span className="rounded-full border border-warn px-2 py-0.5 text-xs font-semibold text-warn">
                    Hidden{c.hiddenByReports ? " by reports" : ""}
                  </span>
                ) : null}
                {c.reports > 0 ? <span className="rounded-full border border-bad px-2 py-0.5 text-xs font-semibold text-bad">{c.reports} report{c.reports === 1 ? "" : "s"}</span> : null}
                {c.likes > 0 ? <span className="text-muted">{c.likes} like{c.likes === 1 ? "" : "s"}</span> : null}
              </div>
              <p className="break-words whitespace-pre-line">{c.body}</p>
              {c.reportReasons.length ? <p className="text-sm text-muted">Reasons given: {c.reportReasons.join(" · ")}</p> : null}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <a href={`${siteUrl}/${c.post.type}/${c.post.slug}#comments`} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  On &ldquo;{c.post.title}&rdquo;{c.parentId ? " (reply)" : ""}<span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="ml-auto flex gap-2">
                  <Form method="post">
                    <input type="hidden" name="id" value={c.id} />
                    {c.status === "hidden" ? (
                      <button name="intent" value="restore" className="btn py-1" disabled={busy} aria-label={`Restore comment by ${c.author.name}`}>Restore</button>
                    ) : (
                      <button name="intent" value="hide" className="btn py-1" disabled={busy} aria-label={`Hide comment by ${c.author.name}`}>Hide</button>
                    )}
                  </Form>
                  <Form method="post" onSubmit={(e) => { if (!window.confirm("Delete this comment for good? Replies stay.")) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={c.id} />
                    <button name="intent" value="delete" className="btn btn-danger py-1" disabled={busy} aria-label={`Delete comment by ${c.author.name}`}>Delete</button>
                  </Form>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
