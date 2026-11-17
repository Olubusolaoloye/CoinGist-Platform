import { useState } from "react";
import { useFetcher } from "react-router";
import type { BlockedLink, StudioPost } from "@coingist/types";
import { formatWhen } from "~/lib/format";
import type { WorkflowAction } from "~/lib/workflow";
import { StatusBadge } from "./StatusBadge";

function ActionForm({ action, disabled }: { action: WorkflowAction; disabled: boolean }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [open, setOpen] = useState(false);
  const needsForm = action.note === "required" || action.schedule;
  const busy = fetcher.state !== "idle";
  const cls = { primary: "btn-primary", gist: "btn-gist", danger: "btn-danger", default: "" }[action.style];

  if (needsForm && !open) {
    return (
      <button type="button" className={`btn w-full ${cls}`} disabled={disabled} onClick={() => setOpen(true)}>
        {action.label}
      </button>
    );
  }

  return (
    <fetcher.Form
      method="post"
      className={needsForm ? "space-y-2 rounded-md border border-line p-3" : ""}
      onSubmit={(e) => {
        const form = e.currentTarget;
        if (action.confirm && !window.confirm(action.confirm)) return e.preventDefault();
        // datetime-local has no time zone: convert the writer's local time to ISO here.
        const local = form.elements.namedItem("scheduledLocal") as HTMLInputElement | null;
        const iso = form.elements.namedItem("scheduledFor") as HTMLInputElement | null;
        if (local && iso) iso.value = local.value ? new Date(local.value).toISOString() : "";
      }}
    >
      <input type="hidden" name="intent" value="transition" />
      <input type="hidden" name="to" value={action.to} />
      {action.note === "required" ? (
        <div>
          <label htmlFor={`note-${action.to}`} className="label">What needs to change?</label>
          <textarea id={`note-${action.to}`} name="note" required rows={3} className="field" />
          <p className="hint">The writer sees this as a comment on the story.</p>
        </div>
      ) : null}
      {action.schedule ? (
        <div>
          <label htmlFor="scheduledLocal" className="label">Publish at (your local time)</label>
          <input id="scheduledLocal" name="scheduledLocal" type="datetime-local" required className="field" />
          <input type="hidden" name="scheduledFor" />
        </div>
      ) : null}
      <div className="flex gap-2">
        <button className={`btn w-full ${cls}`} disabled={disabled || busy}>
          {busy ? "Working…" : action.label}
        </button>
        {needsForm ? <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button> : null}
      </div>
      {fetcher.data?.error ? <p role="alert" className="text-sm text-bad">{fetcher.data.error}</p> : null}
    </fetcher.Form>
  );
}

export function WorkflowPanel({
  post,
  actions,
  dirty,
  blocked,
}: {
  post: StudioPost;
  actions: WorkflowAction[];
  dirty: boolean;
  /** Links (as last saved) that point at blocked domains. */
  blocked: BlockedLink[];
}) {
  return (
    <section aria-labelledby="workflow-h" className="panel space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="workflow-h" className="font-display text-lg font-extrabold">Status</h2>
        <StatusBadge status={post.status} />
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2"><dt className="text-muted">Author</dt><dd>{post.author.name ?? "Unknown"}</dd></div>
        {post.approvedBy ? (
          <div className="flex gap-2"><dt className="text-muted">Approved by</dt><dd>{post.approvedBy.name} · {post.approvedAt ? formatWhen(post.approvedAt) : ""}</dd></div>
        ) : null}
        {post.scheduledFor ? <div className="flex gap-2"><dt className="text-muted">Goes live</dt><dd>{formatWhen(post.scheduledFor)}</dd></div> : null}
        {post.publishedAt ? <div className="flex gap-2"><dt className="text-muted">Published</dt><dd>{formatWhen(post.publishedAt)}</dd></div> : null}
      </dl>
      {blocked.length > 0 ? (
        <div role="alert" className="rounded-md border border-bad p-3 text-sm">
          <p className="font-semibold">This story links to blocked domains, so it can't be approved:</p>
          <ul className="mt-1 list-disc pl-5">
            {blocked.map((b) => (
              <li key={b.host}>
                <span className="font-mono">{b.host}</span>: {b.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">Remove or replace those links, then save.</p>
        </div>
      ) : null}
      {post.isSponsored && !post.sponsorId ? (
        <p className="rounded-md border border-warn p-2 text-sm">
          Sponsored stories can only be approved once they're linked to an accepted order. An editor links them from the
          order's page under Sponsored.
        </p>
      ) : null}
      {actions.length > 0 ? (
        <div className="space-y-2">
          {dirty ? <p className="text-sm text-warn">Save your changes before changing the status.</p> : null}
          {actions.map((a) => <ActionForm key={a.to} action={a} disabled={dirty} />)}
        </div>
      ) : (
        <p className="text-sm text-muted">No status changes are available to you right now.</p>
      )}
    </section>
  );
}
