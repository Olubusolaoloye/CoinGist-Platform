import { useState } from "react";
import { useFetcher } from "react-router";
import type { StaffAuthor } from "@coingist/types";
import { ImageField } from "~/components/ImageField";

export type AuthorSaveResult = { ok: boolean; message: string };

/** Edit one author profile: name, photo, job title, bio, links and topics. Posts to the current route. */
export function AuthorForm({ author, siteUrl, self }: { author: StaffAuthor; siteUrl: string; self: boolean }) {
  const save = useFetcher<AuthorSaveResult>();
  const busy = save.state !== "idle";
  const [photo, setPhoto] = useState({ url: author.avatarUrl ?? "", alt: author.name ?? "" });
  const id = (k: string) => `${k}-${author.id}`;
  const slug = save.data?.ok ? undefined : author.slug;

  return (
    <save.Form method="post" className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      <input type="hidden" name="avatarUrl" value={photo.url} />
      <div>
        <ImageField
          label="Photo"
          url={photo.url}
          alt={photo.alt || author.name || "Author photo"}
          onChange={(next) => setPhoto(next)}
          ratio="aspect-square"
          hint="A square head-and-shoulders photo, at least 400 × 400 px."
        />
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id("name")} className="label">Display name</label>
            <input id={id("name")} name="name" required maxLength={80} defaultValue={author.name ?? ""} className="field" placeholder="As it appears on bylines" />
          </div>
          <div>
            <label htmlFor={id("title")} className="label">Job title (optional)</label>
            <input id={id("title")} name="title" maxLength={80} defaultValue={author.title ?? ""} className="field" placeholder="e.g. Markets reporter" />
          </div>
        </div>
        <div>
          <label htmlFor={id("bio")} className="label">Short bio (optional)</label>
          <textarea id={id("bio")} name="bio" rows={3} maxLength={1000} defaultValue={author.bio ?? ""} className="field"
            placeholder={self ? "Two or three sentences about what you cover and your background." : "Two or three sentences about what they cover."} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor={id("x")} className="label">X (Twitter)</label><input id={id("x")} name="x" type="url" defaultValue={author.socials.x ?? ""} className="field" placeholder="https://x.com/…" /></div>
          <div><label htmlFor={id("linkedin")} className="label">LinkedIn</label><input id={id("linkedin")} name="linkedin" type="url" defaultValue={author.socials.linkedin ?? ""} className="field" placeholder="https://linkedin.com/in/…" /></div>
          <div><label htmlFor={id("website")} className="label">Website</label><input id={id("website")} name="website" type="url" defaultValue={author.socials.website ?? ""} className="field" placeholder="https://…" /></div>
        </div>
        <div>
          <label htmlFor={id("expertise")} className="label">Topics covered (optional)</label>
          <input id={id("expertise")} name="expertise" defaultValue={author.expertise.join(", ")} className="field" placeholder="Bitcoin, Regulation, Nigeria" />
          <p className="hint">Separate with commas, up to 8. Shown on the author page.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          {slug ? (
            <a href={`${siteUrl}/author/${slug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-link hover:underline">
              View author page<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {save.data ? (
            <p role={save.data.ok ? "status" : "alert"} className={`text-sm ${save.data.ok ? "text-ok" : "text-bad"}`}>{save.data.message}</p>
          ) : null}
        </div>
      </div>
    </save.Form>
  );
}

/** FormData from AuthorForm → the API's profile body. */
export function authorBody(form: FormData) {
  const text = (k: string) => String(form.get(k) ?? "");
  return {
    name: text("name"),
    avatarUrl: text("avatarUrl"),
    title: text("title"),
    bio: text("bio"),
    socials: { x: text("x"), linkedin: text("linkedin"), website: text("website") },
    expertise: text("expertise").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
}
