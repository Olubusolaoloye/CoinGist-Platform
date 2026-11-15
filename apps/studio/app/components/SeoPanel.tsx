import { checklistScore, seoChecklist, type CheckStatus } from "@coingist/seo";
import { slugify } from "@coingist/types";
import type { Draft } from "~/lib/draft";

const ICON: Record<CheckStatus, { label: string; cls: string; glyph: string }> = {
  pass: { label: "Done", cls: "text-ok", glyph: "✓" },
  warn: { label: "Suggestion", cls: "text-warn", glyph: "!" },
  fail: { label: "Needs fixing", cls: "text-bad", glyph: "✕" },
};

export function SeoPanel({
  draft,
  set,
  editable,
  siteUrl,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  editable: boolean;
  siteUrl: string;
}) {
  const checks = seoChecklist({
    ...draft,
    excerpt: draft.excerpt || null,
    seoTitle: draft.seoTitle || null,
    seoDescription: draft.seoDescription || null,
    heroImage: draft.heroImageUrl ? { url: draft.heroImageUrl, alt: draft.heroImageAlt } : null,
    categorySlug: draft.categorySlug || null,
  });
  const score = checklistScore(checks);
  const title = draft.seoTitle || draft.title;
  const description = draft.seoDescription || draft.excerpt;

  return (
    <section aria-labelledby="seo-h" className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="seo-h" className="font-display text-lg font-extrabold">Search and social</h2>
        <span className="text-sm text-muted">{score.pass}/{checks.length} done</span>
      </div>

      <div aria-label="Search result preview" className="rounded-md border border-line p-3">
        <p className="truncate text-xs text-muted">{siteUrl.replace(/^https?:\/\//, "")}/{draft.type}/{draft.slug}</p>
        <p className="mt-0.5 line-clamp-2 text-[1.05rem] leading-snug text-link">{title} | CoinGist</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{description || "Add a description to control this snippet."}</p>
      </div>

      <div>
        <label htmlFor="seoTitle" className="label">Search title <span className="font-normal text-muted">(optional)</span></label>
        <input id="seoTitle" className="field" maxLength={70} value={draft.seoTitle} disabled={!editable}
          onChange={(e) => set({ seoTitle: e.target.value })} placeholder={draft.title} />
        <p className="hint">{(draft.seoTitle || draft.title).length}/60 characters. Leave blank to use the headline.</p>
      </div>
      <div>
        <label htmlFor="seoDescription" className="label">Meta description <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="seoDescription" className="field" rows={3} maxLength={170} value={draft.seoDescription} disabled={!editable}
          onChange={(e) => set({ seoDescription: e.target.value })} placeholder={draft.excerpt} />
        <p className="hint">{(draft.seoDescription || draft.excerpt).length}/160 characters. Leave blank to use the excerpt.</p>
      </div>
      <div>
        <label htmlFor="slug" className="label">URL slug</label>
        <div className="flex gap-2">
          <input id="slug" className="field font-mono text-sm" value={draft.slug} disabled={!editable}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          {editable ? <button type="button" className="btn whitespace-nowrap" onClick={() => set({ slug: slugify(draft.title) })}>From headline</button> : null}
        </div>
        <p className="hint">Changing the slug of a published story breaks existing links to it.</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Checklist</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center font-bold ${ICON[c.status].cls}`} aria-hidden="true">{ICON[c.status].glyph}</span>
              <span><span className="sr-only">{ICON[c.status].label}: </span>{c.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
