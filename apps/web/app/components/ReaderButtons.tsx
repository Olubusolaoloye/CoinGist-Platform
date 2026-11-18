import { useEffect, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import type { FollowType, ReaderState } from "@coingist/types";

const HINT = "cg_signed_in";

/**
 * Is this browser signed in? Read after hydration from a non-secret hint cookie, so cached
 * public pages render the same HTML for everyone and personalise only in the browser.
 */
export function useSignedIn(): boolean {
  const [on, setOn] = useState(false);
  // Re-check after every navigation: signing in or out changes the cookie without a reload.
  const { key } = useLocation();
  useEffect(() => {
    setOn(document.cookie.split("; ").some((c) => c === `${HINT}=1`));
  }, [key]);
  return on;
}

type StateResponse = ({ signedIn: true } & ReaderState) | { signedIn: false };

/** The reader's saved/followed state for this page, loaded once and shared by every button. */
export function useReaderState(postId?: string) {
  const signedIn = useSignedIn();
  const fetcher = useFetcher<StateResponse>({ key: `reader-state:${postId ?? "page"}` });
  useEffect(() => {
    if (signedIn && fetcher.state === "idle" && !fetcher.data) fetcher.load(`/account/state${postId ? `?postId=${postId}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, postId]);
  const data = fetcher.data?.signedIn ? fetcher.data : null;
  return { signedIn: signedIn && fetcher.data?.signedIn !== false, state: data };
}

const icon = {
  bookmark: (filled: boolean) => (
    <svg viewBox="0 0 24 24" className="size-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  ),
  plus: (done: boolean) => (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      {done ? <path d="M5 12l5 5 9-10" /> : <path d="M12 5v14M5 12h14" />}
    </svg>
  ),
};

function useHere() {
  const location = useLocation();
  return location.pathname + location.search;
}

const pill =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60";

/** Save a story to read later. Signed-out readers are sent to sign in, then back here. */
export function SaveButton({ postId, title }: { postId: string; title: string }) {
  const here = useHere();
  const { signedIn, state } = useReaderState(postId);
  const action = useFetcher<{ ok: boolean; error?: string }>({ key: `save:${postId}` });
  const pending = action.formData?.get("intent");
  const saved = pending ? pending === "save" : (state?.bookmarked ?? false);

  if (!signedIn) {
    return (
      <Link to={`/account/login?next=${encodeURIComponent(here)}`} className={`${pill} border-line hover:border-ink`}>
        {icon.bookmark(false)} Save<span className="sr-only"> "{title}" (sign in)</span>
      </Link>
    );
  }
  return (
    <action.Form method="post" action="/account/actions">
      <input type="hidden" name="js" value="1" />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={here} />
      <button
        name="intent"
        value={saved ? "unsave" : "save"}
        aria-pressed={saved}
        disabled={!state && !pending}
        className={`${pill} ${saved ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
      >
        {icon.bookmark(saved)} {saved ? "Saved" : "Save"}<span className="sr-only"> "{title}"</span>
      </button>
      {action.data && !action.data.ok ? <span role="alert" className="ml-2 text-sm text-bad">{action.data.error}</span> : null}
    </action.Form>
  );
}

/** Follow a writer, topic or tag; their new stories show up under For you. */
export function FollowButton({ type, slug, name, postId, showName = false, className = "" }: { type: FollowType; slug: string; name: string; postId?: string; showName?: boolean; className?: string }) {
  const here = useHere();
  const { signedIn, state } = useReaderState(postId);
  const action = useFetcher<{ ok: boolean; error?: string }>({ key: `follow:${type}:${slug}` });
  const pending = action.formData?.get("intent");
  const following = pending ? pending === "follow" : (state?.follows.some((f) => f.type === type && f.slug === slug) ?? false);

  if (!signedIn) {
    return (
      <Link to={`/account/login?next=${encodeURIComponent(here)}`} className={`${pill} border-line hover:border-ink ${className}`}>
        {icon.plus(false)} Follow{showName ? ` ${name}` : <span className="sr-only"> {name}</span>}<span className="sr-only"> (sign in)</span>
      </Link>
    );
  }
  return (
    <action.Form method="post" action="/account/actions" className={className}>
      <input type="hidden" name="js" value="1" />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="redirectTo" value={here} />
      <button
        name="intent"
        value={following ? "unfollow" : "follow"}
        aria-pressed={following}
        disabled={!state && !pending}
        className={`${pill} ${following ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
      >
        {icon.plus(following)} {following ? "Following" : "Follow"}{showName ? ` ${name}` : <span className="sr-only"> {name}</span>}
      </button>
      {action.data && !action.data.ok ? <span role="alert" className="ml-2 text-sm text-bad">{action.data.error}</span> : null}
    </action.Form>
  );
}
