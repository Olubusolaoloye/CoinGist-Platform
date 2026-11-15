import type { RichTextDoc, RichTextNode } from "./content.js";
import { safeHref, safeImageSrc } from "./url.js";

/**
 * Server-side allowlist for Tiptap JSON. Runs on every save, so the database only ever holds
 * nodes, marks and attributes the public renderer knows how to display safely.
 * The renderer applies the same rules again on output (defence in depth).
 */

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "youtube",
  "xPost",
]);
const MARKS = new Set(["bold", "italic", "strike", "code", "link"]);

export const MAX_BODY_BYTES = 400_000;
const MAX_DEPTH = 12;
const MAX_TEXT = 20_000;

export function youtubeId(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const m =
    /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/.exec(
      src.trim(),
    );
  return m?.[1] ?? null;
}

/** Canonical https://x.com/<user>/status/<id> URL, or null. */
export function xPostUrl(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const m = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[?#].*)?$/.exec(
    src.trim(),
  );
  return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
}

function cleanText(t: unknown): string | null {
  return typeof t === "string" && t.length > 0 ? t.slice(0, MAX_TEXT) : null;
}

function cleanMarks(marks: unknown): RichTextNode["marks"] {
  if (!Array.isArray(marks)) return undefined;
  const out: NonNullable<RichTextNode["marks"]> = [];
  for (const m of marks as Array<{ type?: unknown; attrs?: Record<string, unknown> }>) {
    if (!m || typeof m.type !== "string" || !MARKS.has(m.type)) continue;
    if (m.type === "link") {
      const href = safeHref(m.attrs?.["href"]);
      if (href) out.push({ type: "link", attrs: { href } });
    } else {
      out.push({ type: m.type });
    }
  }
  return out.length ? out : undefined;
}

function cleanAttrs(type: string, attrs: Record<string, unknown> | undefined) {
  const a = attrs ?? {};
  switch (type) {
    case "heading": {
      const level = Math.min(4, Math.max(2, Number(a["level"]) || 2));
      return { level };
    }
    case "orderedList": {
      const start = Number(a["start"]);
      return Number.isInteger(start) && start > 1 ? { start } : undefined;
    }
    case "image": {
      const src = safeImageSrc(a["src"]);
      if (!src) return null;
      const alt = typeof a["alt"] === "string" ? a["alt"].slice(0, 300) : "";
      const out: Record<string, unknown> = { src, alt };
      if (typeof a["title"] === "string" && a["title"]) out["title"] = a["title"].slice(0, 300);
      for (const k of ["width", "height"]) {
        const n = Number(a[k]);
        if (Number.isInteger(n) && n > 0 && n <= 4000) out[k] = n;
      }
      return out;
    }
    case "youtube": {
      const id = youtubeId(a["src"]);
      return id ? { src: `https://www.youtube.com/watch?v=${id}` } : null;
    }
    case "xPost": {
      const url = xPostUrl(a["src"]);
      return url ? { src: url } : null;
    }
    default:
      return undefined;
  }
}

function cleanNode(node: unknown, depth: number): RichTextNode[] {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return [];
  const n = node as RichTextNode;

  if (n.type === "text") {
    const text = cleanText(n.text);
    if (!text) return [];
    const marks = cleanMarks(n.marks);
    return [{ type: "text", text, ...(marks ? { marks } : {}) }];
  }

  const children = Array.isArray(n.content) ? n.content.flatMap((c) => cleanNode(c, depth + 1)) : [];
  if (typeof n.type !== "string" || !BLOCK_NODES.has(n.type)) {
    // Unknown wrapper: keep what's inside it.
    return children;
  }

  const attrs = cleanAttrs(n.type, n.attrs);
  if (attrs === null) return []; // required attribute was unsafe (image/embed)

  const out: RichTextNode = { type: n.type };
  if (attrs) out.attrs = attrs;
  if (n.type === "codeBlock") {
    const text = children
      .map((c) => c.text ?? "")
      .join("")
      .slice(0, MAX_TEXT);
    if (text) out.content = [{ type: "text", text }];
  } else if (children.length && !["image", "youtube", "xPost", "horizontalRule", "hardBreak"].includes(n.type)) {
    out.content = children;
  }
  return [out];
}

export function sanitizeRichText(input: unknown): RichTextDoc {
  const doc = input as RichTextNode | null;
  const content =
    doc && typeof doc === "object" && doc.type === "doc" && Array.isArray(doc.content)
      ? doc.content.flatMap((c) => cleanNode(c, 1))
      : [];
  return { type: "doc", content };
}

export function isEmptyDoc(doc: RichTextDoc): boolean {
  return !doc.content?.some((n) => n.type !== "paragraph" || (n.content?.length ?? 0) > 0);
}
