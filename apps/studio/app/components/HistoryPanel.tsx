import { useFetcher } from "react-router";
import type { RevisionSummary } from "@coingist/types";
import { formatWhen } from "~/lib/format";

export function HistoryPanel({
  revisions,
  canRestore,
  dirty,
  onRestore,
}: {
  revisions: RevisionSummary[];
  canRestore: boolean;
  dirty: boolean;
  onRestore: () => void;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  return (
    <section aria-labelledby="history-h" className="panel space-y-3">
      <h2 id="history-h" className="font-display text-lg font-extrabold">History</h2>
      {revisions.length === 0 ? (
        <p className="text-sm text-muted">Earlier versions appear here each time the headline or story text is saved.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {revisions.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 border-b border-line pb-2 last:border-0">
              <span>
                <span className="block font-medium">{r.title}</span>
                <span className="text-xs text-muted">Replaced {formatWhen(r.createdAt)}{r.editor?.name ? ` by ${r.editor.name}` : ""}</span>
              </span>
              {canRestore ? (
                <fetcher.Form method="post" onSubmit={(e) => {
                  if (!window.confirm("Restore this version of the headline and story text? The current version is kept in history.")) e.preventDefault();
                  else onRestore();
                }}>
                  <input type="hidden" name="intent" value="restore" />
                  <input type="hidden" name="revisionId" value={r.id} />
                  <button className="text-xs font-semibold text-link hover:underline disabled:opacity-50" disabled={dirty || fetcher.state !== "idle"}>Restore</button>
                </fetcher.Form>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {dirty && canRestore && revisions.length ? <p className="hint">Save or discard your changes before restoring.</p> : null}
      {fetcher.data?.error ? <p role="alert" className="text-sm text-bad">{fetcher.data.error}</p> : null}
    </section>
  );
}
