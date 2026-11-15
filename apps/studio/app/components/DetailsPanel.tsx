import { POST_TYPES, type CategoryRef, type TagRef } from "@coingist/types";
import type { Draft } from "~/lib/draft";

export function DetailsPanel({
  draft,
  set,
  editable,
  categories,
  tags,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  editable: boolean;
  categories: CategoryRef[];
  tags: TagRef[];
}) {
  const bullets = [...draft.summaryBullets, "", "", "", "", ""].slice(0, 5);
  return (
    <section aria-labelledby="details-h" className="panel space-y-4">
      <h2 id="details-h" className="font-display text-lg font-extrabold">Details</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="type" className="label">Section</label>
          <select id="type" className="field capitalize" value={draft.type} disabled={!editable}
            onChange={(e) => set({ type: e.target.value as Draft["type"] })}>
            {POST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" className="field" value={draft.categorySlug} disabled={!editable}
            onChange={(e) => set({ categorySlug: e.target.value })}>
            <option value="">Choose…</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">Tags <span className="font-normal text-muted">(up to 10)</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = draft.tagSlugs.includes(t.slug);
            return (
              <label key={t.slug} className={`cursor-pointer rounded-full border px-2.5 py-1 text-sm has-[:focus-visible]:outline-2 ${on ? "border-ink bg-ink text-paper" : "border-line"}`}>
                <input type="checkbox" className="sr-only" checked={on} disabled={!editable || (!on && draft.tagSlugs.length >= 10)}
                  onChange={() => set({ tagSlugs: on ? draft.tagSlugs.filter((s) => s !== t.slug) : [...draft.tagSlugs, t.slug] })} />
                {t.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="excerpt" className="label">Excerpt</label>
        <textarea id="excerpt" className="field" rows={3} maxLength={400} value={draft.excerpt} disabled={!editable}
          onChange={(e) => set({ excerpt: e.target.value })} />
        <p className="hint">One or two sentences under the headline and on story cards.</p>
      </div>

      <fieldset>
        <legend className="label">The gist (2–5 bullets)</legend>
        <div className="space-y-1.5">
          {bullets.map((b, i) => (
            <input key={i} aria-label={`Gist bullet ${i + 1}`} className="field" maxLength={200} value={b} disabled={!editable}
              onChange={(e) => {
                const next = [...bullets];
                next[i] = e.target.value;
                // Keep blanks between bullets (so typing order is stable), trim trailing blanks.
                while (next.length && next[next.length - 1] === "") next.pop();
                set({ summaryBullets: next });
              }} />
          ))}
        </div>
        <p className="hint">Shown in the yellow box at the top of the story.</p>
      </fieldset>

      <div>
        <label htmlFor="heroUrl" className="label">Hero image</label>
        <input id="heroUrl" className="field" placeholder="https://… or /path" value={draft.heroImageUrl} disabled={!editable}
          onChange={(e) => set({ heroImageUrl: e.target.value })} />
        {draft.heroImageUrl ? (
          <>
            <label htmlFor="heroAlt" className="label mt-2">Hero image alt text (required)</label>
            <input id="heroAlt" className="field" value={draft.heroImageAlt} disabled={!editable} required
              onChange={(e) => set({ heroImageAlt: e.target.value })} />
          </>
        ) : null}
        <p className="hint">16:9, at least 1200px wide. Uploads arrive with media storage.</p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={draft.aiAssisted} disabled={!editable || draft.aiAssisted}
          onChange={(e) => set({ aiAssisted: e.target.checked })} />
        <span>
          <span className="font-semibold">AI tools helped write this</span>
          <span className="block text-muted">Shown to readers. Once set, it stays set.</span>
        </span>
      </label>
    </section>
  );
}
