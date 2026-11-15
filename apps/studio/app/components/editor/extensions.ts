import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { safeHref } from "@coingist/types";

/** Embeds are stored as {type, attrs: {src}} and shown as a card while editing. */
function embedNode(name: "youtube" | "xPost", label: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return { src: { default: null } };
    },
    parseHTML() {
      return [{ tag: `div[data-embed="${name}"]`, getAttrs: (el) => ({ src: (el as HTMLElement).dataset["src"] }) }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes({ "data-embed": name, "data-src": HTMLAttributes["src"], class: "embed-card" }),
        `${label}: ${String(HTMLAttributes["src"] ?? "")}`,
      ];
    },
  });
}

/**
 * Only nodes and marks the public renderer and the server allowlist support, so anything
 * pasted in that the site can't show is dropped while writing, not silently on save.
 */
export function editorExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => safeHref(url) !== null,
        HTMLAttributes: { rel: null, target: null },
      },
    }),
    Image.configure({ inline: false, allowBase64: false }),
    embedNode("youtube", "YouTube video"),
    embedNode("xPost", "Post on X"),
    Placeholder.configure({ placeholder }),
  ];
}
