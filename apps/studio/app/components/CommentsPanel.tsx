import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { EditorialComment } from "@coingist/types";
import { formatWhen } from "~/lib/format";

function ResolveButton({ comment }: { comment: EditorialComment }) {
  const fetcher = useFetcher();
  const resolved = comment.resolvedAt !== null;
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="resolve" />
      <input type="hidden" name="commentId" value={comment.id} />
      <input type="hidden" name="resolved" value={resolved ? "false" : "true"} />
      <button className="text-xs font-semibold text-link hover:underline" disabled={fetcher.state !== "idle"}>
        {resolved ? "Reopen" : "Mark resolved"}
      </button>
    </fetcher.Form>
  );
}

export function CommentsPanel({ comments }: { comments: EditorialComment[] }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) form.current?.reset();
  }, [fetcher.state, fetcher.data]);
  const open = comments.filter((c) => !c.resolvedAt).length;

  return (
    <section aria-labelledby="comments-h" className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="comments-h" className="font-display text-lg font-extrabold">Comments</h2>
        <span className="text-sm text-muted">{open} open</span>
      </div>
      {comments.length === 0 ? <p className="text-sm text-muted">No comments yet. Notes between writer and editor go here.</p> : null}
      <ol className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className={`rounded-md border p-3 text-sm ${c.resolvedAt ? "border-line opacity-70" : "border-warn"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{c.author.name ?? "Unknown"}</span>
              <time className="text-xs text-muted" dateTime={c.createdAt}>{formatWhen(c.createdAt)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            <div className="mt-2 flex items-center justify-between">
              {c.resolvedAt ? <span className="text-xs text-muted">Resolved</span> : <span />}
              <ResolveButton comment={c} />
            </div>
          </li>
        ))}
      </ol>
      <fetcher.Form method="post" ref={form} className="space-y-2">
        <input type="hidden" name="intent" value="comment" />
        <label htmlFor="new-comment" className="label">Add a comment</label>
        <textarea id="new-comment" name="body" required rows={3} maxLength={5000} className="field" />
        {fetcher.data?.error ? <p role="alert" className="text-sm text-bad">{fetcher.data.error}</p> : null}
        <button className="btn" disabled={fetcher.state !== "idle"}>Post comment</button>
      </fetcher.Form>
    </section>
  );
}
