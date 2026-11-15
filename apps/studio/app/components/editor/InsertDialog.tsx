import { useEffect, useRef, useState } from "react";
import { safeHref, safeImageSrc, xPostUrl, youtubeId } from "@coingist/types";

export type InsertKind = "link" | "image" | "youtube" | "xPost";

const COPY: Record<InsertKind, { title: string; urlLabel: string; urlHint: string }> = {
  link: { title: "Add link", urlLabel: "Link address", urlHint: "https://… or a CoinGist path like /learn/what-is-a-stablecoin" },
  image: { title: "Add image", urlLabel: "Image address", urlHint: "https:// image URL. Uploads arrive with media storage." },
  youtube: { title: "Embed a YouTube video", urlLabel: "Video URL", urlHint: "https://www.youtube.com/watch?v=… or https://youtu.be/…" },
  xPost: { title: "Embed a post from X", urlLabel: "Post URL", urlHint: "https://x.com/handle/status/…" },
};

function validate(kind: InsertKind, url: string, alt: string): string | null {
  if (kind === "link" && !safeHref(url)) return "Use an https:// address or a path starting with /.";
  if (kind === "image") {
    if (!safeImageSrc(url)) return "Use an https:// image address.";
    if (!alt.trim()) return "Describe the image for people who can't see it.";
  }
  if (kind === "youtube" && !youtubeId(url)) return "That isn't a YouTube video link.";
  if (kind === "xPost" && !xPostUrl(url)) return "That isn't a link to a post on X.";
  return null;
}

export function InsertDialog({
  kind,
  initialUrl = "",
  needsText = false,
  onSubmit,
  onClose,
}: {
  kind: InsertKind | null;
  initialUrl?: string;
  /** Link with nothing selected: ask for the words to link. */
  needsText?: boolean;
  onSubmit: (v: { url: string; alt: string; caption: string; text: string }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (kind) {
      setUrl(initialUrl);
      setText("");
      setAlt("");
      setCaption("");
      setError(null);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [kind, initialUrl]);

  if (!kind) return <dialog ref={ref} />;
  const copy = COPY[kind];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="insert-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-5 text-ink backdrop:bg-black/40"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          const problem =
            kind === "link" && needsText && !text.trim() ? "Enter the words to link." : validate(kind, url.trim(), alt);
          if (problem) return setError(problem);
          onSubmit({ url: url.trim(), alt: alt.trim(), caption: caption.trim(), text: text.trim() });
          ref.current?.close();
        }}
        className="space-y-4"
      >
        <h2 id="insert-title" className="font-display text-xl font-extrabold">{copy.title}</h2>
        {kind === "link" && needsText ? (
          <div>
            <label htmlFor="insert-text" className="label">Text to show</label>
            <input id="insert-text" className="field" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <p className="hint">Or select words in the story first, then add the link.</p>
          </div>
        ) : null}
        <div>
          <label htmlFor="insert-url" className="label">{copy.urlLabel}</label>
          <input id="insert-url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus={!(kind === "link" && needsText)} />
          <p className="hint">{copy.urlHint}</p>
        </div>
        {kind === "image" ? (
          <>
            <div>
              <label htmlFor="insert-alt" className="label">Alt text (required)</label>
              <input id="insert-alt" className="field" value={alt} onChange={(e) => setAlt(e.target.value)} />
              <p className="hint">What the image shows, for screen readers and search.</p>
            </div>
            <div>
              <label htmlFor="insert-caption" className="label">Caption (optional)</label>
              <input id="insert-caption" className="field" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
          </>
        ) : null}
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {kind === "link" && initialUrl ? (
            <button type="button" className="btn btn-danger mr-auto" onClick={() => { onSubmit({ url: "", alt: "", caption: "", text: "" }); ref.current?.close(); }}>
              Remove link
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn btn-primary">{kind === "link" ? "Apply" : "Insert"}</button>
        </div>
      </form>
    </dialog>
  );
}
