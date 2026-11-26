import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import { COMMENT_MAX, type MyEngagement, type PublicComment } from "@coingist/types";
import { track } from "~/lib/analytics";

type Engagement = {
  likes: number;
  comments: PublicComment[];
  me: { id: string; name: string | null } | null;
  liked: MyEngagement | null;
};
type Result = { ok: true; likes?: number } | { ok: false; error: string };

/**
 * Likes and comments for a story. Loaded in the browser after the page (which is cached for
 * everyone) has rendered, so they're always current. One shared fetcher per story.
 */
export function useEngagement(postId: string) {
  const fetcher = useFetcher<Engagement>({ key: `engagement:${postId}` });
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) fetcher.load(`/engagement?postId=${postId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
  return fetcher.data ?? null;
}

function useHere() {
  const l = useLocation();
  return l.pathname + l.search;
}

const heart = (filled: boolean) => (
  <svg viewBox="0 0 24 24" className="size-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20s-7-4.4-9.2-9A4.8 4.8 0 0 1 12 6.6 4.8 4.8 0 0 1 21.2 11C19 15.6 12 20 12 20z" />
  </svg>
);

const pill = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60";

/** Like a story. Signed-out readers are sent to sign in, then back. */
export function LikeButton({ postId, title }: { postId: string; title: string }) {
  const here = useHere();
  const e = useEngagement(postId);
  const like = useFetcher<Result>({ key: `like-post:${postId}` });
  const pending = like.formData ? like.formData.get("intent") === "like-post" : null;
  const liked = pending ?? e?.liked?.likedPost ?? false;
  const base = e?.likes ?? 0;
  const serverLiked = e?.liked?.likedPost ?? false;
  const count = pending === null ? base : Math.max(0, base + (pending === serverLiked ? 0 : pending ? 1 : -1));
  const label = `${liked ? "Unlike" : "Like"} "${title}"`;

  if (e && !e.me) {
    return (
      <Link to={`/account/login?next=${encodeURIComponent(here)}`} className={`${pill} border-line hover:border-ink`}>
        {heart(false)} <Count n={base} label={`Like "${title}"`} suffix=" (sign in first)" />
      </Link>
    );
  }
  return (
    <like.Form method="post" action="/engagement" onSubmit={() => !liked && track("Story Like")}>
      <input type="hidden" name="intent" value={liked ? "unlike-post" : "like-post"} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={here} />
      <button
        className={`${pill} ${liked ? "border-bad/40 bg-bad/10 text-bad" : "border-line hover:border-ink"}`}
        aria-pressed={liked}
        disabled={!e}
      >
        {heart(liked)} <Count n={count} label={label} />
      </button>
    </like.Form>
  );
}

/**
 * Visible: the count (or "Like"). Spoken: the full label, then the count, so the accessible name
 * always contains the visible text (WCAG 2.5.3).
 */
function Count({ n, label, suffix = "" }: { n: number; label: string; suffix?: string }) {
  return n > 0 ? (
    <>
      <span className="sr-only">{label}, </span>
      <span>{n}</span>
      <span className="sr-only"> {n === 1 ? "like" : "likes"}{suffix}</span>
    </>
  ) : (
    <>
      <span aria-hidden="true">Like</span>
      <span className="sr-only">{label}{suffix}</span>
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "R";
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CommentBox({
  postId,
  parentId,
  initial = "",
  intent,
  id,
  label,
  submitLabel,
  onDone,
  autoFocus = false,
}: {
  postId: string;
  parentId?: string;
  initial?: string;
  intent: "comment" | "edit";
  id?: string;
  label: string;
  submitLabel: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const here = useHere();
  const f = useFetcher<Result>();
  const [text, setText] = useState(initial);
  const busy = f.state !== "idle";
  const last = useRef<Result | undefined>(undefined);
  useEffect(() => {
    if (f.state === "idle" && f.data && f.data !== last.current) {
      last.current = f.data;
      if (f.data.ok) {
        setText("");
        if (intent === "comment" && !parentId) track("Comment");
        onDone?.();
      }
    }
  }, [f.state, f.data, onDone, intent, parentId]);
  const fieldId = `cbox-${intent}-${id ?? parentId ?? "new"}`;
  return (
    <f.Form method="post" action="/engagement" className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={here} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <label htmlFor={fieldId} className="sr-only">{label}</label>
      <textarea
        id={fieldId}
        name="body"
        rows={parentId || id ? 2 : 3}
        maxLength={COMMENT_MAX}
        required
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        placeholder={parentId ? "Write a reply…" : "Share your thoughts…"}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base focus:border-ink focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex min-h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-60" disabled={busy || !text.trim()}>
          {busy ? "Posting…" : submitLabel}
        </button>
        {onDone ? (
          <button type="button" className="text-sm font-semibold text-muted" onClick={onDone}>Cancel</button>
        ) : null}
        {text.length > COMMENT_MAX - 200 ? <span className="text-xs text-muted">{COMMENT_MAX - text.length} characters left</span> : null}
        {f.data && !f.data.ok ? <p role="alert" className="text-sm text-bad">{f.data.error}</p> : null}
      </div>
    </f.Form>
  );
}

function SmallAction({ intent, id, postId, children, label, className = "", confirm }: {
  intent: string; id: string; postId: string; children: React.ReactNode; label: string; className?: string; confirm?: string;
}) {
  const here = useHere();
  const f = useFetcher<Result>();
  return (
    <f.Form
      method="post"
      action="/engagement"
      className="inline"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={here} />
      <button className={`text-sm font-semibold text-muted hover:text-ink disabled:opacity-60 ${className}`} disabled={f.state !== "idle"} aria-label={label}>
        {f.data && !f.data.ok ? <span role="alert" className="text-bad">{f.data.error}</span> : children}
      </button>
    </f.Form>
  );
}

function CommentLike({ c, postId, liked, signedIn }: { c: PublicComment; postId: string; liked: boolean; signedIn: boolean }) {
  const here = useHere();
  const f = useFetcher<Result>();
  const pending = f.formData ? f.formData.get("intent") === "like-comment" : null;
  const on = pending ?? liked;
  const count = pending === null ? c.likes : Math.max(0, c.likes + (pending === liked ? 0 : pending ? 1 : -1));
  const who = c.author?.name ?? "this comment";
  if (!signedIn) {
    return (
      <Link to={`/account/login?next=${encodeURIComponent(here)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span className="[&>svg]:size-4">{heart(false)}</span>
        <span className="sr-only">Like {who}&rsquo;s comment{count > 0 ? ", " : " (sign in first)"}</span>
        {count > 0 ? <span>{count}<span className="sr-only"> (sign in first)</span></span> : null}
      </Link>
    );
  }
  return (
    <f.Form method="post" action="/engagement" className="inline">
      <input type="hidden" name="intent" value={on ? "unlike-comment" : "like-comment"} />
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={here} />
      <button className={`inline-flex items-center gap-1 text-sm font-semibold ${on ? "text-bad" : "text-muted hover:text-ink"}`} aria-pressed={on}>
        <span className="[&>svg]:size-4">{heart(on)}</span>
        <span className="sr-only">{on ? "Unlike" : "Like"} {who}&rsquo;s comment{count > 0 ? ", " : ""}</span>
        {count > 0 ? <span>{count}</span> : null}
      </button>
    </f.Form>
  );
}

function CommentItem({ c, postId, e, reply }: { c: PublicComment; postId: string; e: Engagement; reply?: boolean }) {
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  const mine = !!e.me && c.author?.id === e.me.id;
  const signedIn = !!e.me;
  const liked = e.liked?.likedCommentIds.includes(c.id) ?? false;
  const name = c.author?.name ?? "";

  if (c.removed) {
    return <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted italic">This comment was removed.</p>;
  }
  return (
    <article aria-label={`Comment by ${name}`} className="flex gap-3">
      {c.author?.avatarUrl ? (
        <img src={c.author.avatarUrl} alt="" className={`${reply ? "size-8" : "size-10"} shrink-0 rounded-full object-cover`} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden="true" className={`${reply ? "size-8 text-xs" : "size-10 text-sm"} grid shrink-0 place-items-center rounded-full bg-gist font-bold text-gist-ink`}>{initials(name)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold">{name}</span>
          {c.author?.isStaff ? <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">CoinGist</span> : null}
          {mine ? <span className="text-xs text-muted">(you)</span> : null}
          <time dateTime={c.createdAt} className="text-muted">{ago(c.createdAt)}</time>
          {c.edited ? <span className="text-muted">· edited</span> : null}
        </p>
        {mode === "edit" ? (
          <div className="mt-2">
            <CommentBox postId={postId} id={c.id} intent="edit" initial={c.body} label="Edit your comment" submitLabel="Save" onDone={() => setMode("view")} autoFocus />
          </div>
        ) : (
          <p className="mt-1 break-words whitespace-pre-line">{c.body}</p>
        )}
        {mode !== "edit" ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-4">
            <CommentLike c={c} postId={postId} liked={liked} signedIn={signedIn} />
            {signedIn ? (
              <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={() => setMode(mode === "reply" ? "view" : "reply")} aria-expanded={mode === "reply"} aria-label={`Reply to ${name}`}>
                Reply
              </button>
            ) : null}
            {mine ? (
              <>
                <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={() => setMode("edit")} aria-label="Edit your comment">Edit</button>
                <SmallAction intent="delete" id={c.id} postId={postId} label="Delete your comment" confirm="Delete your comment? This can't be undone.">Delete</SmallAction>
              </>
            ) : signedIn ? (
              <SmallAction intent="report" id={c.id} postId={postId} label={`Report ${name}'s comment`} confirm="Report this comment to our editors as spam or abuse?">Report</SmallAction>
            ) : null}
          </div>
        ) : null}
        {mode === "reply" ? (
          <div className="mt-2">
            <CommentBox postId={postId} parentId={c.parentId ?? c.id} intent="comment" label={`Reply to ${name}`} submitLabel="Reply" onDone={() => setMode("view")} autoFocus />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function NameForm() {
  const here = useHere();
  const f = useFetcher<Result>();
  return (
    <f.Form method="post" action="/engagement" className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
      <input type="hidden" name="intent" value="name" />
      <input type="hidden" name="redirectTo" value={here} />
      <div className="min-w-48 flex-1">
        <label htmlFor="comment-name" className="text-sm font-semibold">Your name on comments</label>
        <input id="comment-name" name="name" required maxLength={60} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" placeholder="e.g. Ada O." />
      </div>
      <button className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-ink" disabled={f.state !== "idle"}>Save name</button>
      {f.data && !f.data.ok ? <p role="alert" className="w-full text-sm text-bad">{f.data.error}</p> : null}
    </f.Form>
  );
}

/** The comments section at the end of a story. */
export function Comments({ postId, title }: { postId: string; title: string }) {
  const here = useHere();
  const e = useEngagement(postId);
  const top = e?.comments.filter((c) => !c.parentId) ?? [];
  const count = e?.comments.filter((c) => !c.removed).length ?? 0;

  return (
    <section id="comments" aria-labelledby="comments-h" className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-3">
        <h2 id="comments-h" className="font-display text-2xl font-extrabold tracking-tight">
          Comments{e && count > 0 ? <span className="text-muted"> ({count})</span> : null}
        </h2>
        <LikeButton postId={postId} title={title} />
      </div>

      <div className="mt-5 space-y-4">
        {!e ? (
          <p role="status" className="text-muted">Loading comments…</p>
        ) : e.me ? (
          <>
            {!e.me.name ? <NameForm /> : null}
            <CommentBox postId={postId} intent="comment" label="Write a comment" submitLabel="Post comment" />
            <p className="text-xs text-muted">
              Be kind and stay on topic. Links aren&rsquo;t clickable, and comments promoting investments or giveaways are removed.
              Posting as <strong>{e.me.name ?? "Reader"}</strong>.
            </p>
          </>
        ) : (
          <div className="glass rounded-2xl p-4 sm:p-5">
            <p className="font-semibold">Join the conversation</p>
            <p className="mt-1 text-sm text-muted">Sign in to comment, reply and like. It&rsquo;s free.</p>
            <Link to={`/account/login?next=${encodeURIComponent(`${here}#comments`)}`} className="mt-3 inline-flex min-h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper">
              Sign in to comment
            </Link>
          </div>
        )}
      </div>

      {e ? (
        top.length === 0 ? (
          <p className="mt-6 text-muted">No comments yet. Start the conversation.</p>
        ) : (
          <ol className="mt-8 space-y-6">
            {top.map((c) => {
              const replies = e.comments.filter((r) => r.parentId === c.id);
              return (
                <li key={c.id}>
                  <CommentItem c={c} postId={postId} e={e} />
                  {replies.length ? (
                    <ol className="mt-4 ml-5 space-y-4 border-l-2 border-line pl-4 sm:ml-12">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <CommentItem c={r} postId={postId} e={e} reply />
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )
      ) : null}
    </section>
  );
}
