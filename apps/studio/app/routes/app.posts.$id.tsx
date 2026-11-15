import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { data, redirect, useBlocker, useFetcher } from "react-router";
import type {
  CategoryRef,
  EditorialComment,
  Revision,
  RevisionSummary,
  StudioPost,
  TagRef,
} from "@coingist/types";
import type { Route } from "./+types/app.posts.$id";
import { CommentsPanel } from "~/components/CommentsPanel";
import { DetailsPanel } from "~/components/DetailsPanel";
import { RichEditor } from "~/components/editor/RichEditor";
import { HistoryPanel } from "~/components/HistoryPanel";
import { SeoPanel } from "~/components/SeoPanel";
import { WorkflowPanel } from "~/components/WorkflowPanel";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { draftFingerprint, draftFromPost, draftToPayload, type Draft } from "~/lib/draft";
import { env } from "~/lib/env.server";
import { studioHeaders } from "~/lib/headers";
import { useMe } from "~/lib/me";
import { canEditContent, lockedReason, workflowActions } from "~/lib/workflow";

export const headers = studioHeaders;

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.post.title ?? "Post"} | CoinGist Studio` }];
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  if (!UUID.test(params.id)) throw data({ error: "Not found" }, { status: 404 });
  const api = studioApi(auth);
  const base = `/v1/studio/posts/${params.id}`;
  const [{ post }, { comments }, { revisions }, taxonomy] = await Promise.all([
    api.get<{ post: StudioPost }>(base),
    api.get<{ comments: EditorialComment[] }>(`${base}/comments`),
    api.get<{ revisions: RevisionSummary[] }>(`${base}/revisions`),
    api.get<{ categories: CategoryRef[]; tags: TagRef[] }>("/v1/studio/taxonomy"),
  ]);
  return data({ post, comments, revisions, taxonomy, siteUrl: env.siteUrl }, { headers: auth.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const form = await request.formData();
  const intent = form.get("intent");
  const base = `/v1/studio/posts/${params.id}`;
  const fail = (message: string, status = 400) => data({ ok: false, error: message }, { status, headers: auth.headers });
  const done = () => data({ ok: true }, { headers: auth.headers });

  switch (intent) {
    case "save": {
      let payload: unknown;
      try {
        payload = JSON.parse(String(form.get("payload")));
      } catch {
        return fail("Couldn't read the changes. Refresh and try again.");
      }
      const r = await api.patch(base, payload);
      return r.ok ? done() : fail(r.message, r.status);
    }
    case "transition": {
      const note = String(form.get("note") ?? "").trim();
      const scheduledFor = String(form.get("scheduledFor") ?? "");
      const r = await api.post(`${base}/transition`, {
        to: form.get("to"),
        ...(note ? { note } : {}),
        ...(scheduledFor ? { scheduledFor } : {}),
      });
      return r.ok ? done() : fail(r.code === "conflict" || r.code === "invalid" ? r.message : r.message, r.status);
    }
    case "comment": {
      const r = await api.post(`${base}/comments`, { body: String(form.get("body") ?? "") });
      return r.ok ? done() : fail(r.message, r.status);
    }
    case "resolve": {
      const r = await api.patch(`/v1/studio/comments/${String(form.get("commentId"))}`, {
        resolved: form.get("resolved") === "true",
      });
      return r.ok ? done() : fail(r.message, r.status);
    }
    case "restore": {
      const { revision } = await api.get<{ revision: Revision }>(`/v1/studio/revisions/${String(form.get("revisionId"))}`);
      const r = await api.patch(base, { title: revision.title, body: revision.body });
      return r.ok ? done() : fail(r.message, r.status);
    }
    case "delete": {
      const r = await api.del(base);
      if (!r.ok) return fail(r.message, r.status);
      throw redirect("/posts", { headers: auth.headers });
    }
    default:
      return fail("Unknown action.");
  }
}

// Keyed by post id so opening another post always starts with fresh form state.
export default function EditPostRoute({ loaderData }: Route.ComponentProps) {
  return <EditPost key={loaderData.post.id} {...loaderData} />;
}

function EditPost({ post, comments, revisions, taxonomy, siteUrl }: Route.ComponentProps["loaderData"]) {
  const me = useMe();
  const editable = canEditContent(me.user.role, me.user.id, post);
  const actions = workflowActions(me.user.role, me.user.id, post);

  const [draft, setDraft] = useState<Draft>(() => draftFromPost(post));
  const [saved, setSaved] = useState(() => draftFingerprint(draftFromPost(post)));
  const [editorKey, setEditorKey] = useState(post.id);
  const reloadFromServer = useRef(false);
  const submitted = useRef<string | null>(null);

  const current = useMemo(() => draftFingerprint(draft), [draft]);
  const dirty = editable && current !== saved;
  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const saver = useFetcher<{ ok: boolean; error?: string }>();
  const saving = saver.state !== "idle";

  const save = useCallback(() => {
    if (!dirty || saving) return;
    submitted.current = current;
    void saver.submit({ intent: "save", payload: JSON.stringify(draftToPayload(draft)) }, { method: "post" });
  }, [dirty, saving, current, draft, saver]);

  // A successful save makes what we sent the new baseline (typing during the save stays dirty).
  useEffect(() => {
    if (saver.state === "idle" && saver.data?.ok && submitted.current) {
      setSaved(submitted.current);
      submitted.current = null;
    }
  }, [saver.state, saver.data]);

  // A revision restore replaces the content on the server: reload the form from it.
  useEffect(() => {
    if (reloadFromServer.current) {
      reloadFromServer.current = false;
      const fresh = draftFromPost(post);
      setDraft(fresh);
      setSaved(draftFingerprint(fresh));
      setEditorKey(`${post.id}:${post.updatedAt}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.updatedAt, post.id]);

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Don't lose work: warn on tab close and on in-app navigation.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const status = useMemo(() => {
    if (!editable) return null;
    if (saving) return "Saving…";
    if (saver.data && !saver.data.ok) return null;
    return dirty ? "Unsaved changes" : "All changes saved";
  }, [editable, saving, saver.data, dirty]);

  const deleter = useFetcher();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {blocker.state === "blocked" ? (
        <div role="alertdialog" aria-labelledby="leave-h" className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warn bg-surface p-3">
          <p id="leave-h" className="font-semibold">You have unsaved changes.</p>
          <button className="btn" onClick={() => blocker.reset()}>Keep editing</button>
          <button className="btn btn-danger" onClick={() => blocker.proceed()}>Leave without saving</button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          {!editable ? (
            <p className="rounded-md border border-line bg-surface p-3 text-sm">{lockedReason(post.status)}</p>
          ) : null}
          <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
            {editable ? (
              <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
            <span role="status" className="text-sm text-muted">{status}</span>
            {saver.data && !saver.data.ok ? <span role="alert" className="text-sm text-bad">{saver.data.error}</span> : null}
            {post.status === "published" ? (
              <a href={`${siteUrl}/${post.type}/${post.slug}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-sm font-semibold text-link hover:underline">
                View on site<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>

          <div>
            <label htmlFor="title" className="sr-only">Headline</label>
            <textarea
              id="title"
              rows={2}
              maxLength={300}
              value={draft.title}
              disabled={!editable}
              onChange={(e) => set({ title: e.target.value.replace(/\n/g, " ") })}
              className="w-full resize-none bg-transparent font-display text-3xl leading-tight font-extrabold tracking-tight outline-none sm:text-4xl"
              placeholder="Headline"
            />
          </div>

          <RichEditor value={draft.body} resetKey={editorKey} editable={editable} onChange={(body) => set({ body })} />
          <p className="hint">Cmd/Ctrl+S saves. Pasted formatting the site can't show is removed.</p>

          {editable && post.status === "draft" && post.author.id === me.user.id ? (
            <deleter.Form method="post" onSubmit={(e) => { if (!window.confirm("Delete this draft? This can't be undone.")) e.preventDefault(); }}>
              <input type="hidden" name="intent" value="delete" />
              <button className="btn btn-danger">Delete draft</button>
            </deleter.Form>
          ) : null}
        </div>

        <aside className="space-y-4" aria-label="Post settings">
          <WorkflowPanel post={post} actions={actions} dirty={dirty} />
          <DetailsPanel draft={draft} set={set} editable={editable} categories={taxonomy.categories} tags={taxonomy.tags} />
          <SeoPanel draft={draft} set={set} editable={editable} siteUrl={siteUrl} />
          <CommentsPanel comments={comments} />
          <HistoryPanel revisions={revisions} canRestore={editable} dirty={dirty} onRestore={() => { reloadFromServer.current = true; }} />
        </aside>
      </div>
    </main>
  );
}
