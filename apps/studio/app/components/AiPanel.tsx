import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import {
  AI_FEATURE_LABEL,
  docToPlainText,
  readabilityReport,
  REPURPOSE_FORMATS,
  REPURPOSE_LABEL,
  type AiClaims,
  type AiDraft,
  type AiFeature,
  type AiGist,
  type AiOutline,
  type AiQuota,
  type AiRepurpose,
  type AiSeo,
  type AiStatus,
  type AiUsageEntry,
  type InternalLinkSuggestion,
  type RepurposeFormat,
  type RichTextNode,
} from "@coingist/types";
import type { Draft } from "~/lib/draft";

type Tool = "outline" | "draft" | "gist" | "seo" | "links" | "check" | "repurpose";
const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "outline", label: "Outline" },
  { id: "draft", label: "Draft" },
  { id: "gist", label: "Gist" },
  { id: "seo", label: "SEO" },
  { id: "links", label: "Links" },
  { id: "check", label: "Check" },
  { id: "repurpose", label: "Share" },
];

type Run = { ok: true; feature: AiFeature; result: unknown; provider: "claude" | "offline"; quota: AiQuota } | { ok: false; feature: string; error: string };

const p = (text: string): RichTextNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });

/** Tiptap nodes for an outline: H2 per section with a bullet list of points. */
function outlineNodes(o: AiOutline): RichTextNode[] {
  return o.sections.flatMap((s) => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: s.heading }] },
    { type: "bulletList", content: s.points.map((pt) => ({ type: "listItem", content: [p(pt)] })) },
  ]);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-sm font-semibold text-link hover:underline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * AI assist for one story. Every result is a suggestion with an explicit "use" button; nothing
 * is saved until the person saves the story, and everything still goes through review.
 */
export function AiPanel({
  postId,
  draft,
  set,
  editable,
  published,
  siteUrl,
  onAppendToBody,
  onAiUsed,
}: {
  postId: string;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  editable: boolean;
  published: boolean;
  siteUrl: string;
  onAppendToBody: (nodes: RichTextNode[]) => void;
  onAiUsed: () => void;
}) {
  const info = useFetcher<{ status: AiStatus; links: InternalLinkSuggestion[]; usage: AiUsageEntry[] }>();
  const runner = useFetcher<Run>();
  const [tool, setTool] = useState<Tool>("outline");
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<RepurposeFormat>("x_thread");
  const [results, setResults] = useState<Partial<Record<AiFeature, unknown>>>({});
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  // Load status, link ideas and history once (and after each AI run, for the history).
  useEffect(() => {
    if (info.state === "idle" && !info.data) info.load(`/ai?postId=${postId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    if (runner.state !== "idle" || !runner.data) return;
    const d = runner.data;
    if (d.ok) {
      setResults((r) => ({ ...r, [d.feature]: d.result }));
      setQuota(d.quota);
      setError(null);
      onAiUsed();
      info.load(`/ai?postId=${postId}`);
    } else setError(d.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner.state, runner.data]);

  const text = useMemo(() => docToPlainText(draft.body), [draft.body]);
  const readability = useMemo(() => (tool === "check" ? readabilityReport(text) : null), [tool, text]);
  const status = info.data?.status;
  const q = quota ?? status?.quota ?? null;
  const busy = runner.state !== "idle";
  const busyFeature = busy ? String(runner.formData?.get("feature") ?? "") : null;

  const ask = (feature: AiFeature, payload: Record<string, unknown>) => {
    setError(null);
    setApplied(null);
    void runner.submit({ feature, payload: JSON.stringify({ postId, title: draft.title, ...payload }) }, { method: "post", action: "/ai" });
  };
  const use = (what: string, fn: () => void) => {
    fn();
    setApplied(`${what} added. Review it, then save.`);
  };

  const outline = results.outline as AiOutline | undefined;
  const drafted = results.draft as AiDraft | undefined;
  const gist = results.gist as AiGist | undefined;
  const seo = results.seo as AiSeo | undefined;
  const claims = results.claims as AiClaims | undefined;
  const shared = results.repurpose as AiRepurpose | undefined;

  const runButton = ({ feature, label, payload, disabled }: { feature: AiFeature; label: string; payload: Record<string, unknown>; disabled?: boolean }) => (
    <button type="button" className="btn w-full" disabled={busy || disabled || !draft.title.trim() || q?.remaining === 0} onClick={() => ask(feature, payload)}>
      {busyFeature === feature ? "Thinking…" : label}
    </button>
  );
  const applyButton = ({ label, onClick }: { label: string; onClick: () => void }) =>
    editable ? <button type="button" className="text-sm font-semibold text-link hover:underline" onClick={onClick}>{label}</button> : null;

  if (info.data && !status?.provider) {
    return (
      <section aria-labelledby="ai-h" className="panel space-y-2">
        <h2 id="ai-h" className="font-display text-lg font-extrabold">AI assist</h2>
        <p className="text-sm text-muted">AI assist isn't set up on this server. Ask an admin to add an Anthropic API key.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="ai-h" className="panel space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="ai-h" className="font-display text-lg font-extrabold">AI assist</h2>
        {q ? <span className="text-xs text-muted">{q.remaining} of {q.limit} left today</span> : null}
      </div>
      <p className="text-xs text-muted">
        Suggestions only: check every fact before you use them. Using AI on a story marks it as AI-assisted for readers, and it still needs an editor's approval.
      </p>
      {status?.provider === "offline" ? (
        <p className="rounded-md border border-warn p-2 text-xs">Sample mode: no AI model is connected, so suggestions only rearrange your own words.</p>
      ) : null}

      <div role="tablist" aria-label="AI tools" className="flex flex-wrap gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ai-tab-${t.id}`}
            aria-selected={tool === t.id}
            aria-controls="ai-tool"
            onClick={() => { setTool(t.id); setError(null); setApplied(null); }}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tool === t.id ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="ai-tool" role="tabpanel" aria-labelledby={`ai-tab-${tool}`} className="space-y-3">
        {(tool === "outline" || tool === "draft") && (
          <>
            <div>
              <label htmlFor="ai-notes" className="label">Your notes</label>
              <textarea id="ai-notes" className="field text-sm" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Facts, sources, quotes and links you have. AI uses only what you give it." />
            </div>
            {tool === "outline" ? (
              runButton({ feature: "outline", label: "Suggest an outline", payload: { notes, text } })
            ) : (
              runButton({ feature: "draft", label: "Draft from my notes", payload: { notes, text }, disabled: notes.trim().length < 20 })
            )}
          </>
        )}

        {tool === "outline" && outline ? (
          <div className="space-y-2 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              {outline.sections.map((s, i) => (
                <li key={i}><strong>{s.heading}</strong><ul className="list-disc pl-5 text-muted">{s.points.map((pt, j) => <li key={j}>{pt}</li>)}</ul></li>
              ))}
            </ol>
            {outline.openQuestions.length ? (
              <div><p className="font-semibold">Still to find out</p><ul className="list-disc pl-5 text-muted">{outline.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ) : null}
            {applyButton({ label: "Add outline to the end of the story", onClick: () => use("Outline", () => onAppendToBody(outlineNodes(outline))) })}
          </div>
        ) : null}

        {tool === "draft" && drafted ? (
          <div className="space-y-2 text-sm">
            {drafted.paragraphs.map((x, i) => <p key={i}>{x}</p>)}
            {drafted.toVerify.length ? (
              <div className="rounded-md border border-warn p-2"><p className="font-semibold">Verify before submitting</p><ul className="list-disc pl-5">{drafted.toVerify.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ) : null}
            {applyButton({ label: "Add draft to the end of the story", onClick: () => use("Draft", () => onAppendToBody(drafted.paragraphs.map(p))) })}
          </div>
        ) : null}

        {tool === "gist" && (
          <>
            <p className="text-sm text-muted">Three bullets readers see at the top of the story.</p>
            {runButton({ feature: "gist", label: "Suggest the gist", payload: { text }, disabled: text.length < 200 })}
            {text.length < 200 ? <p className="hint">Write a bit more of the story first.</p> : null}
            {gist ? (
              <div className="space-y-2 text-sm">
                <ul className="list-disc pl-5">{gist.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                {applyButton({ label: "Use as the gist", onClick: () => use("Gist", () => set({ summaryBullets: gist.bullets })) })}
              </div>
            ) : null}
          </>
        )}

        {tool === "seo" && (
          <>
            {runButton({ feature: "seo", label: "Suggest title, description and slug", payload: { text, excerpt: draft.excerpt }, disabled: text.length < 200 })}
            {seo ? (
              <dl className="space-y-2 text-sm">
                {([
                  ["Search title", seo.seoTitle, () => set({ seoTitle: seo.seoTitle })],
                  ["Meta description", seo.seoDescription, () => set({ seoDescription: seo.seoDescription })],
                  ["Excerpt", seo.excerpt, () => set({ excerpt: seo.excerpt })],
                  ["Slug", seo.slug, published ? null : () => set({ slug: seo.slug })],
                ] as const).map(([label, value, apply]) => (
                  <div key={label}>
                    <dt className="font-semibold">{label}</dt>
                    <dd className="break-words">{value}</dd>
                    <dd>{apply ? applyButton({ label: `Use ${label.toLowerCase()}`, onClick: () => use(label, apply) }) : <span className="hint">Published stories keep their slug.</span>}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}

        {tool === "links" && (
          <div className="text-sm">
            <p className="text-muted">Published CoinGist stories on related topics. Copy one, select words in the story, then use the Link button. (No AI request needed.)</p>
            {info.data?.links.length ? (
              <ul className="mt-2 divide-y divide-line">
                {info.data.links.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 py-1.5">
                    <span><span className="font-semibold">{l.title}</span> <span className="text-xs text-muted capitalize">({l.type})</span></span>
                    <CopyButton text={`${siteUrl}${l.path}`} label={`Copy link to "${l.title}"`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted">{info.state === "loading" ? "Looking…" : "No related stories yet. Add a category and tags to improve matches."}</p>
            )}
          </div>
        )}

        {tool === "check" && readability && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <div><dt className="text-muted">Reading ease</dt><dd className="font-semibold">{readability.readingEase} <span className="font-normal text-muted">{readability.readingEase >= 60 ? "(easy)" : readability.readingEase >= 45 ? "(fair)" : "(hard)"}</span></dd></div>
              <div><dt className="text-muted">Average sentence</dt><dd className="font-semibold">{readability.avgSentenceWords} words</dd></div>
              <div><dt className="text-muted">Length</dt><dd className="font-semibold">{readability.words} words, {readability.readingMinutes} min</dd></div>
              <div><dt className="text-muted">Passive voice</dt><dd className="font-semibold">{readability.passiveHints} likely</dd></div>
            </dl>
            {readability.redFlags.length ? (
              <div className="rounded-md border border-bad p-2"><p className="font-semibold text-bad">Breaks the editorial policy</p>
                <ul className="list-disc pl-5">{readability.redFlags.map((f) => <li key={f.phrase}>"{f.phrase}": {f.why}</li>)}</ul></div>
            ) : null}
            {readability.jargon.length ? <p><span className="font-semibold">Explain on first use:</span> {readability.jargon.join(", ")}</p> : null}
            {readability.longSentences.length ? (
              <details><summary className="cursor-pointer text-link">{readability.longSentences.length} sentence(s) over 30 words</summary>
                <ul className="mt-1 list-disc pl-5 text-muted">{readability.longSentences.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
            ) : null}
            {runButton({ feature: "claims", label: "Check claims with AI", payload: { text }, disabled: text.length < 200 })}
            {claims ? (
              claims.claims.length === 0 ? <p className="text-ok">No claims flagged. Still check your sources.</p> : (
                <ul className="space-y-2">
                  {claims.claims.map((c, i) => (
                    <li key={i} className="rounded-md border border-line p-2">
                      <q className="font-semibold">{c.quote}</q>
                      <p className="text-muted">{c.issue}</p>
                      <p>{c.suggestion}</p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        )}

        {tool === "repurpose" && (
          <>
            <div>
              <label htmlFor="ai-format" className="label">Format</label>
              <select id="ai-format" className="field" value={format} onChange={(e) => setFormat(e.target.value as RepurposeFormat)}>
                {REPURPOSE_FORMATS.map((f) => <option key={f} value={f}>{REPURPOSE_LABEL[f]}</option>)}
              </select>
            </div>
            {runButton({ feature: "repurpose", label: `Write a ${REPURPOSE_LABEL[format].toLowerCase()}`, payload: { text, format }, disabled: text.length < 200 })}
            {shared && shared.format === format ? (
              <ol className="space-y-2 text-sm">
                {shared.posts.map((x, i) => (
                  <li key={i} className="rounded-md border border-line p-2">
                    <p className="whitespace-pre-line">{x}</p>
                    <div className="mt-1 flex justify-between text-xs text-muted">
                      <span>{x.length} characters</span>
                      <CopyButton text={x} label={`Copy ${REPURPOSE_LABEL[format].toLowerCase()}${shared.posts.length > 1 ? ` part ${i + 1}` : ""}`} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="hint">Nothing is posted for you. Copy it into the channel once the story is live.</p>
          </>
        )}

        <div role="status" className="text-sm">{applied ? <span className="text-ok">{applied}</span> : null}</div>
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      </div>

      {info.data?.usage.length ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">AI used on this story ({info.data.usage.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {info.data.usage.map((u, i) => (
              <li key={i}>{AI_FEATURE_LABEL[u.feature]} by {u.userName ?? "someone"}, {new Date(u.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{u.provider === "offline" ? " (sample)" : ""}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
