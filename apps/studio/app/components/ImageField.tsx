import { useEffect, useId, useRef } from "react";
import { useFetcher } from "react-router";

type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * An image: preview, upload from the computer (to Supabase Storage), or paste a URL, plus the
 * alt text readers with screen readers hear. Used for story hero images and site images.
 */
export function ImageField({
  label,
  url,
  alt,
  onChange,
  disabled = false,
  hint,
  ratio = "aspect-[16/9]",
}: {
  label: string;
  url: string;
  alt: string;
  onChange: (next: { url: string; alt: string }) => void;
  disabled?: boolean;
  hint?: string;
  ratio?: string;
}) {
  const id = useId();
  const upload = useFetcher<UploadResult>();
  const input = useRef<HTMLInputElement>(null);
  const busy = upload.state !== "idle";

  // When an upload finishes, use its URL.
  const last = useRef<UploadResult | undefined>(undefined);
  useEffect(() => {
    if (upload.state === "idle" && upload.data && upload.data !== last.current) {
      last.current = upload.data;
      if (upload.data.ok) onChange({ url: upload.data.url, alt });
    }
  }, [upload.state, upload.data, alt, onChange]);

  function pick(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    upload.submit(body, { method: "post", action: "/media", encType: "multipart/form-data" });
  }

  return (
    <div className="space-y-2">
      <span className="label" id={`${id}-label`}>{label}</span>
      <div className={`group relative overflow-hidden rounded-xl border border-line bg-paper ${ratio}`}>
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">No image yet</div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/50 text-sm font-semibold text-white backdrop-blur-sm" role="status">
            Uploading…
          </div>
        ) : null}
      </div>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            hidden
            aria-label={`${label} file`}
            id={`${id}-file`}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
            {url ? "Replace image" : "Upload image"}
          </button>
          {url ? (
            <button type="button" className="text-sm font-semibold text-muted underline" disabled={busy} onClick={() => onChange({ url: "", alt: "" })}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {upload.data && !upload.data.ok ? <p role="alert" className="text-sm text-bad">{upload.data.error}</p> : null}
      <div>
        <label htmlFor={`${id}-url`} className="label">Image URL</label>
        <input id={`${id}-url`} className="field" placeholder="https://… or /path" value={url} disabled={disabled}
          onChange={(e) => onChange({ url: e.target.value, alt })} />
      </div>
      {url ? (
        <div>
          <label htmlFor={`${id}-alt`} className="label">Alt text (required)</label>
          <input id={`${id}-alt`} className="field" value={alt} disabled={disabled} required
            placeholder="Describe the image for people who can't see it"
            onChange={(e) => onChange({ url, alt: e.target.value })} />
        </div>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
