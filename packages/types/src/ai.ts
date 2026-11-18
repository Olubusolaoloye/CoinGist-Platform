import { z } from "zod";

/**
 * AI assist (Studio only). Every result is a suggestion a person must choose to use; nothing
 * the model writes is ever saved or published on its own.
 */
export const AI_FEATURES = ["outline", "draft", "gist", "seo", "repurpose", "claims", "trending"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  outline: "Outline",
  draft: "Draft from notes",
  gist: "Gist in 30 seconds",
  seo: "SEO suggestions",
  repurpose: "Repurpose",
  claims: "Claim check",
  trending: "Trending digest",
};

export const REPURPOSE_FORMATS = ["x_thread", "telegram", "newsletter"] as const;
export type RepurposeFormat = (typeof REPURPOSE_FORMATS)[number];
export const REPURPOSE_LABEL: Record<RepurposeFormat, string> = {
  x_thread: "X thread",
  telegram: "Telegram post",
  newsletter: "Newsletter blurb",
};

// ─── Requests ───────────────────────────────────────────────────────────────

const Title = z.string().trim().min(1, "Add a headline first").max(300);
/** Plain text of the story as it is in the editor now (may be unsaved). */
const Text = z.string().max(60_000, "The story is too long for AI assist (60,000 characters)");
const Notes = z.string().trim().max(5_000).default("");

const PostScoped = { postId: z.string().uuid(), title: Title };

export const AiOutlineSchema = z.object({ ...PostScoped, notes: Notes, text: Text.default("") }).strict();
export const AiDraftSchema = z
  .object({ ...PostScoped, notes: z.string().trim().min(20, "Add a few lines of notes to draft from").max(5_000), text: Text.default("") })
  .strict();
export const AiGistSchema = z.object({ ...PostScoped, text: Text.min(200, "Write a bit more of the story first") }).strict();
export const AiSeoSchema = z.object({ ...PostScoped, excerpt: z.string().max(400).default(""), text: Text.min(200, "Write a bit more of the story first") }).strict();
export const AiRepurposeSchema = z
  .object({ ...PostScoped, format: z.enum(REPURPOSE_FORMATS), text: Text.min(200, "Write a bit more of the story first") })
  .strict();
export const AiClaimsSchema = z.object({ ...PostScoped, text: Text.min(200, "Write a bit more of the story first") }).strict();
export const AiTrendingSchema = z.object({ notes: Notes }).strict();

export type AiOutlineInput = z.infer<typeof AiOutlineSchema>;
export type AiDraftInput = z.infer<typeof AiDraftSchema>;
export type AiGistInput = z.infer<typeof AiGistSchema>;
export type AiSeoInput = z.infer<typeof AiSeoSchema>;
export type AiRepurposeInput = z.infer<typeof AiRepurposeSchema>;
export type AiClaimsInput = z.infer<typeof AiClaimsSchema>;

// ─── Results ────────────────────────────────────────────────────────────────

export interface AiOutline {
  sections: Array<{ heading: string; points: string[] }>;
  /** Things the writer still needs to find out or confirm. */
  openQuestions: string[];
}
export interface AiDraft {
  paragraphs: string[];
  /** Facts in the draft the writer must verify before submitting. */
  toVerify: string[];
}
export interface AiGist { bullets: string[] }
export interface AiSeo { seoTitle: string; seoDescription: string; slug: string; excerpt: string }
export interface AiRepurpose { format: RepurposeFormat; posts: string[] }
export interface AiClaim {
  /** Exact words from the story (checked server-side; anything not found is dropped). */
  quote: string;
  issue: string;
  suggestion: string;
}
export interface AiClaims { claims: AiClaim[] }

export interface TrendingHeadline { title: string; link: string; source: string }
export interface TrendingTopic {
  title: string;
  whyItMatters: string;
  angle: string;
  suggestedHeadline: string;
  /** Only links that came from the fetched feeds (others are dropped server-side). */
  sourceLinks: string[];
  /** A recent CoinGist story that already covers this, if any. */
  coveredBy: { id: string; title: string } | null;
}
export interface TrendingDigest {
  topics: TrendingTopic[];
  headlineCount: number;
  sources: string[];
  generatedAt: string;
}

export interface AiResult<T> {
  result: T;
  /** "claude" for real output; "offline" for the built-in sample generator (no API key set). */
  provider: "claude" | "offline";
  quota: AiQuota;
}

export interface AiQuota { limit: number; used: number; remaining: number; resetsAt: string }

export interface AiStatus {
  /** null when AI assist is switched off on the server. */
  provider: "claude" | "offline" | null;
  model: string | null;
  quota: AiQuota | null;
}

export interface AiUsageEntry {
  feature: AiFeature;
  userName: string | null;
  provider: "claude" | "offline";
  createdAt: string;
}

export interface InternalLinkSuggestion { id: string; title: string; type: string; slug: string; path: string; publishedAt: string }

// ─── Readability (deterministic, no model) ─────────────────────────────────

export interface ReadabilityReport {
  words: number;
  sentences: number;
  readingMinutes: number;
  avgSentenceWords: number;
  /** Flesch reading ease, 0–100+ (60+ reads easily for a general audience). */
  readingEase: number;
  longSentences: string[];
  longParagraphs: number;
  passiveHints: number;
  /** Phrases that suggest financial promises or hype (never allowed in CoinGist copy). */
  redFlags: Array<{ phrase: string; why: string }>;
  /** Crypto jargon used without an obvious explanation nearby. */
  jargon: string[];
}

const RED_FLAGS: Array<[RegExp, string]> = [
  [/\bguaranteed? (returns?|profits?|gains?)\b/i, "Promises returns. Crypto investments can lose money."],
  [/\brisk[- ]free\b/i, "Nothing in crypto is risk-free."],
  [/\b(can'?t|cannot|won'?t) (lose|go wrong)\b/i, "Implies no downside."],
  [/\bto the moon\b/i, "Hype language; say what is actually expected and by whom."],
  [/\b(get rich|double your money|10x your)\b/i, "Get-rich framing breaks the editorial policy."],
  [/\b(buy|sell) now\b/i, "Reads as investment advice."],
  [/\bnot a scam\b/i, "Assertion we can't verify; report what regulators or audits say instead."],
  [/\bpassive income\b/i, "Often used to market risky schemes; explain the mechanism and risks."],
];

const JARGON = ["DeFi", "staking", "liquidity pool", "gas fee", "layer 2", "L2", "rollup", "stablecoin", "airdrop", "DEX", "CEX", "HODL", "rug pull", "yield farming", "smart contract", "on-ramp", "off-ramp", "seed phrase", "custodial", "memecoin"];

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w ? 1 : 0;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Plain-language checks that run instantly in the browser and on the server. */
export function readabilityReport(text: string): ReadabilityReport {
  const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/)
    .map((s) => s.trim())
    .filter((s) => /[a-z0-9]/i.test(s));
  const words = text.match(/[A-Za-z0-9’'$%.-]+/g)?.filter((w) => /[a-z0-9]/i.test(w)) ?? [];
  const wc = words.length;
  const sc = Math.max(1, sentences.length);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const readingEase = wc ? Math.round(206.835 - 1.015 * (wc / sc) - 84.6 * (syl / wc)) : 0;
  const lower = text.toLowerCase();
  const jargon = JARGON.filter((j) => {
    const i = lower.indexOf(j.toLowerCase());
    if (i < 0) return false;
    // "Explained" if the term is followed shortly by a gloss: "(…)", "—", ", which", " is a", " means".
    const after = text.slice(i + j.length, i + j.length + 40);
    return !/^\s*(\(|—|–|-|:|, (which|a|an|the)\b| (is|are) (a|an|the|when|where|how)\b| (means|refers to)\b)/i.test(after);
  });
  return {
    words: wc,
    sentences: sentences.length,
    readingMinutes: Math.max(1, Math.round(wc / 220)),
    avgSentenceWords: Math.round((wc / sc) * 10) / 10,
    readingEase,
    longSentences: sentences.filter((s) => s.split(/\s+/).length > 30).slice(0, 5),
    longParagraphs: paragraphs.filter((p) => p.split(/\s+/).length > 120).length,
    passiveHints: (text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) ?? []).length,
    redFlags: RED_FLAGS.flatMap(([re, why]) => {
      const m = text.match(re);
      return m ? [{ phrase: m[0], why }] : [];
    }),
    jargon,
  };
}

/** Plain text of a Tiptap document (paragraph breaks preserved), for AI input and readability. */
export function docToPlainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown, acc: string[]): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") acc.push(node.text);
    if (Array.isArray(node.content)) {
      const block = ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(node.type ?? "");
      const inner: string[] = [];
      for (const c of node.content) walk(c, block ? inner : acc);
      if (block) out.push(inner.join(""));
    }
  };
  walk(doc, out);
  return out.map((s) => s.trim()).filter(Boolean).join("\n\n");
}
