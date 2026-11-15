import { Fragment, type ReactNode } from "react";
import type { RichTextDoc, RichTextNode } from "@coingist/types";
import { isExternal, safeHref, safeImageSrc } from "./url.js";

export interface RichTextOptions {
  /** Absolute site origin, used to tell internal from external links. */
  siteOrigin?: string;
  /** Sponsored content: outbound links get rel="sponsored" (Google requirement). */
  sponsored?: boolean;
}

/**
 * Renders Tiptap JSON with a strict allowlist. Unknown nodes and marks are dropped
 * (their text children are kept), unsafe URLs are removed, and nothing is ever injected
 * as raw HTML. This is the server-side sanitiser for published content.
 */
export function RichText({ doc, ...opts }: { doc: RichTextDoc } & RichTextOptions) {
  return <>{renderChildren(doc.content, opts, "r")}</>;
}

function renderChildren(nodes: RichTextNode[] | undefined, opts: RichTextOptions, key: string) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((n, i) => <Fragment key={`${key}.${i}`}>{renderNode(n, opts, `${key}.${i}`)}</Fragment>);
}

function renderNode(node: RichTextNode, opts: RichTextOptions, key: string): ReactNode {
  if (!node || typeof node !== "object") return null;
  const children = () => renderChildren(node.content, opts, key);

  switch (node.type) {
    case "text":
      return typeof node.text === "string" ? applyMarks(node.text, node.marks, opts) : null;
    case "paragraph":
      return <p>{children()}</p>;
    case "heading": {
      // The page owns the <h1>; body headings start at h2.
      const level = Math.min(4, Math.max(2, Number(node.attrs?.["level"]) || 2));
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      return <Tag>{children()}</Tag>;
    }
    case "bulletList":
      return <ul>{children()}</ul>;
    case "orderedList": {
      const start = Number(node.attrs?.["start"]);
      return <ol start={Number.isInteger(start) && start > 1 ? start : undefined}>{children()}</ol>;
    }
    case "listItem":
      return <li>{children()}</li>;
    case "blockquote":
      return <blockquote>{children()}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{plainText(node)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "hardBreak":
      return <br />;
    case "image": {
      const src = safeImageSrc(node.attrs?.["src"]);
      if (!src) return null;
      const alt = typeof node.attrs?.["alt"] === "string" ? node.attrs["alt"] : "";
      const width = Number(node.attrs?.["width"]) || 1200;
      const height = Number(node.attrs?.["height"]) || 675;
      const caption = typeof node.attrs?.["title"] === "string" ? node.attrs["title"] : null;
      return (
        <figure>
          <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    default:
      // Unknown node: keep its children (e.g. text) but drop the wrapper.
      return children();
  }
}

function applyMarks(
  text: string,
  marks: RichTextNode["marks"],
  opts: RichTextOptions,
): ReactNode {
  let out: ReactNode = text;
  for (const mark of Array.isArray(marks) ? marks : []) {
    switch (mark?.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.["href"]);
        if (!href) break;
        if (isExternal(href, opts.siteOrigin)) {
          const rel = ["noopener", "noreferrer", opts.sponsored ? "sponsored" : "nofollow"].join(" ");
          out = (
            <a href={href} rel={rel} target="_blank">
              {out}
            </a>
          );
        } else {
          out = <a href={href}>{out}</a>;
        }
        break;
      }
      default:
        break; // unknown marks are ignored
    }
  }
  return out;
}

export function plainText(node: RichTextNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  const sep = ["paragraph", "heading", "listItem", "blockquote"].includes(node.type) ? "\n" : "";
  return (node.content ?? []).map(plainText).join("") + sep;
}

/** Estimated reading time in whole minutes (min 1), at ~220 words per minute. */
export function readingTimeMinutes(doc: RichTextDoc): number {
  const words = plainText(doc).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
