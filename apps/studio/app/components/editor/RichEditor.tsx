import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import type { RichTextDoc } from "@coingist/types";
import { editorExtensions } from "./extensions";
import { InsertDialog, type InsertKind } from "./InsertDialog";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-semibold disabled:opacity-40 ${active ? "bg-ink text-paper" : "hover:bg-line"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onInsert }: { editor: Editor; onInsert: (k: InsertKind) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />;
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-surface p-1.5">
      <ToolButton label="H2 heading" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</ToolButton>
      <ToolButton label="H3 subheading" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</ToolButton>
      {sep}
      <ToolButton label="Bold" active={s.bold} onClick={() => c().toggleBold().run()}><strong>B</strong></ToolButton>
      <ToolButton label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()}><em>I</em></ToolButton>
      <ToolButton label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()}><s>S</s></ToolButton>
      <ToolButton label="Code (inline)" active={s.code} onClick={() => c().toggleCode().run()}>{"</>"}</ToolButton>
      <ToolButton label="Link" active={s.link} onClick={() => onInsert("link")}>Link</ToolButton>
      {sep}
      <ToolButton label="List (bulleted)" active={s.bullet} onClick={() => c().toggleBulletList().run()}>• List</ToolButton>
      <ToolButton label="1. List (numbered)" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>1. List</ToolButton>
      <ToolButton label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}>Quote</ToolButton>
      {sep}
      <ToolButton label="Image" onClick={() => onInsert("image")}>Image</ToolButton>
      <ToolButton label="YouTube embed" onClick={() => onInsert("youtube")}>YouTube</ToolButton>
      <ToolButton label="X post embed" onClick={() => onInsert("xPost")}>X post</ToolButton>
      {sep}
      <ToolButton label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()}>Undo</ToolButton>
      <ToolButton label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()}>Redo</ToolButton>
    </div>
  );
}

/**
 * Story body editor. `value` seeds the content; `resetKey` forces a reload (e.g. after a
 * revision restore). Changes are reported as Tiptap JSON.
 */
export function RichEditor({
  value,
  resetKey,
  editable,
  onChange,
}: {
  value: RichTextDoc;
  resetKey: string;
  editable: boolean;
  onChange: (doc: RichTextDoc) => void;
}) {
  const [dialog, setDialog] = useState<InsertKind | null>(null);
  const editor = useEditor({
    extensions: editorExtensions("Write the story…"),
    content: value,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": "Story body", "aria-multiline": "true", role: "textbox", class: "px-5 py-4" } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichTextDoc),
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(value, { emitUpdate: false });
    // Only when the source document is replaced, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, resetKey]);

  useEffect(() => {
    // emitUpdate=false: toggling editability is not a content change.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Captured when the dialog opens (focus moves into the dialog afterwards).
  const [linkNeedsText, setLinkNeedsText] = useState(false);
  const openDialog = (kind: InsertKind) => {
    if (kind === "link" && editor) {
      // Ask for words to link when the selection holds no text (caret only, or an image selected).
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
      setLinkNeedsText(!selectedText && !editor.isActive("link"));
    }
    setDialog(kind);
  };

  function insert({ url, alt, caption, text }: { url: string; alt: string; caption: string; text: string }) {
    if (!editor || !dialog) return;
    const chain = editor.chain().focus();
    if (dialog === "link") {
      if (!url) chain.extendMarkRange("link").unsetLink().run();
      else if (text) {
        // Nothing was selected: insert the linked words, then continue typing unlinked.
        chain
          .insertContent([{ type: "text", text, marks: [{ type: "link", attrs: { href: url } }] }, { type: "text", text: " " }])
          .run();
      } else chain.extendMarkRange("link").setLink({ href: url }).run();
    } else if (dialog === "image") {
      chain.setImage({ src: url, alt, ...(caption ? { title: caption } : {}) }).run();
    } else {
      chain.insertContent({ type: dialog, attrs: { src: url } }).run();
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {editor && editable ? <Toolbar editor={editor} onInsert={openDialog} /> : null}
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-96 px-5 py-4 text-muted">Loading editor…</div>}
      <InsertDialog
        kind={dialog}
        initialUrl={dialog === "link" && editor ? String(editor.getAttributes("link")["href"] ?? "") : ""}
        needsText={dialog === "link" && linkNeedsText}
        onSubmit={insert}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
