import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Extension } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "tiptap-markdown";
import {
  AlertTriangle,
  BarChart3,
  Baseline,
  Bold,
  ChevronDown,
  Columns3,
  Eraser,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2
} from "lucide-react";
import { isUploadConfigured, uploadMediaFile } from "../../api/uploadApi";
import { useToast } from "../Toast";
import { TEXT_COLOR_HEX, stringifyChartSpec } from "../../lib/richText";
import { BlockImage, ChartBlock, HighlightMark, TextColorMark } from "./extensions";
import { ChartDialog } from "./ChartDialog";
import { ImageDialog } from "./ImageDialog";
import { ColorPanel, IconButton, LinkPanel, MenuItem, Popover } from "./menus";

/**
 * - full: headings, lists, quotes, links, colors, images, tables and charts (blogs, Q&A answers, condition text).
 * - compact: text styling, colors, lists and links, no media (short callouts).
 * - points: one point per line, inline styling only. The value stays "point\npoint", the
 *   shape the app's checklists and bullet cards split on.
 */
export type RichTextVariant = "full" | "compact" | "points";

export type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  variant?: RichTextVariant;
  placeholder?: string;
  /** Labels the editing area for screen readers. */
  label: string;
  minHeight?: number;
  /** True while images are uploading: the form shouldn't save until they land. */
  onBusyChange?: (busy: boolean) => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const WORDS_PER_MINUTE = 200;

// Points are paragraphs in the editor. Line-start markers ("1.", "-", "#") are
// escaped on the way in so a point stays a point instead of turning into a list,
// and unescaped on the way out so the app still sees "1. Track…".
const escapeLineStart = (line: string) => line.replace(/^(\d+)([.)])/, "$1\\$2").replace(/^([-+*>#])/, "\\$1");
const unescapeLineStart = (line: string) => line.replace(/^(\d+)\\([.)])/, "$1$2").replace(/^\\([-+*>#])/, "$1");

const pointsToMarkdown = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeLineStart)
    .join("\n\n");

const markdownToPoints = (markdown: string) =>
  markdown
    .split(/\n{2,}/)
    .map((line) => unescapeLineStart(line.replace(/\n/g, " ").trim()))
    .filter(Boolean)
    .join("\n");

const toEditor = (value: string, variant: RichTextVariant) => (variant === "points" ? pointsToMarkdown(value) : value);
const fromEditor = (editor: Editor, variant: RichTextVariant) => {
  const markdown: string = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
  return variant === "points" ? markdownToPoints(markdown) : markdown.trim();
};

const altFromFilename = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

/* ---- Blocks: shared by the "Text style" menu, the Insert menu and the slash menu ---- */

type BlockAction = {
  id: string;
  title: string;
  hint: string;
  keywords: string;
  icon: React.ReactNode;
  run: (editor: Editor, ui: { image: () => void; chart: () => void }) => void;
  shortcut?: string;
};

const TEXT_BLOCKS: BlockAction[] = [
  { id: "p", title: "Text", hint: "Plain paragraph", keywords: "paragraph text body", icon: <Pilcrow size={16} />, shortcut: "Mod+Alt+0", run: (e) => e.chain().focus().setParagraph().run() },
  { id: "h2", title: "Heading", hint: "Section title", keywords: "heading h2 title section", icon: <Heading2 size={16} />, shortcut: "Mod+Alt+2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", title: "Subheading", hint: "Smaller section title", keywords: "subheading h3", icon: <Heading3 size={16} />, shortcut: "Mod+Alt+3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "ul", title: "Bulleted list", hint: "Simple list of points", keywords: "bullet list unordered", icon: <List size={16} />, shortcut: "Mod+Shift+8", run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ol", title: "Numbered list", hint: "Steps in order", keywords: "numbered ordered list steps", icon: <ListOrdered size={16} />, shortcut: "Mod+Shift+7", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "quote", title: "Quote", hint: "Call out a key line", keywords: "quote blockquote callout", icon: <Quote size={16} />, shortcut: "Mod+Shift+B", run: (e) => e.chain().focus().toggleBlockquote().run() }
];

const INSERT_BLOCKS: BlockAction[] = [
  { id: "image", title: "Image", hint: "Upload, paste or drop a picture", keywords: "image picture photo upload", icon: <ImagePlus size={16} />, run: (_e, ui) => ui.image() },
  { id: "chart", title: "Chart", hint: "Bar, line or pie from a small table", keywords: "chart graph bar line pie data", icon: <BarChart3 size={16} />, run: (_e, ui) => ui.chart() },
  { id: "table", title: "Table", hint: "Rows and columns", keywords: "table grid rows columns", icon: <Table2 size={16} />, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "hr", title: "Divider", hint: "A line between sections", keywords: "divider line separator hr", icon: <Minus size={16} />, run: (e) => e.chain().focus().setHorizontalRule().run() }
];

const SLASH_BLOCKS = [...TEXT_BLOCKS, ...INSERT_BLOCKS];

type Slash = { from: number; to: number; query: string; index: number; top: number; left: number };

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  variant = "full",
  placeholder,
  label: ariaLabel,
  minHeight,
  onBusyChange
}) => {
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartDialog, setChartDialog] = useState<{ pos: number | null; spec: string } | null>(null);
  const [imageDialog, setImageDialog] = useState<{ src: string; alt: string; title: string } | null | "new">(null);
  const [uploads, setUploads] = useState(0);
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  slashRef.current = slash;
  const dismissedSlash = useRef<number | null>(null);
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Handlers the (once-built) extensions call into.
  const handlers = useRef({
    openLink: () => {},
    editImage: () => {},
    uploadImages: (_files: File[], _pos?: number) => {},
    slashKey: (_event: KeyboardEvent): boolean => false
  });
  const full = variant === "full";

  useEffect(() => {
    onBusyChange?.(uploads > 0);
  }, [uploads, onBusyChange]);

  const extensions = useMemo(() => {
    const points = variant === "points";
    return [
      StarterKit.configure({
        heading: full ? { levels: [2, 3] } : false,
        blockquote: full ? {} : false,
        codeBlock: full ? {} : false,
        horizontalRule: full ? {} : false,
        code: full ? {} : false,
        bulletList: points ? false : {},
        orderedList: points ? false : {},
        listItem: points ? false : {},
        listKeymap: points ? false : {},
        hardBreak: points ? false : {},
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" }
      }),
      TextColorMark,
      HighlightMark,
      Placeholder.configure({
        placeholder: ({ editor, node }) => {
          if (node.type.name === "heading") return node.attrs.level === 2 ? "Heading" : "Subheading";
          if (editor.isEmpty) return placeholder ?? "";
          return full ? "Type / to add a heading, image, chart…" : points ? "Next point" : "";
        }
      }),
      Markdown.configure({ html: true, tightLists: true, linkify: false, breaks: false, transformPastedText: true }),
      Extension.create({
        name: "nuraShortcuts",
        priority: 1000,
        addKeyboardShortcuts: () => ({
          "Mod-k": () => {
            handlers.current.openLink();
            return true;
          }
        })
      }),
      ...(full
        ? [
            BlockImage.configure({ onEdit: () => handlers.current.editImage() }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            ChartBlock.configure({ onEdit: (pos: number, spec: string) => setChartDialog({ pos, spec }) })
          ]
        : [])
    ];
    // The editor is built once per field; the variant and placeholder don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imageFiles = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

  const editor = useEditor({
    extensions,
    content: toEditor(value, variant),
    editorProps: {
      attributes: { "aria-label": ariaLabel, "aria-multiline": "true", role: "textbox", class: "rte-content", spellcheck: "true" },
      handleKeyDown: (_view, event) => handlers.current.slashKey(event),
      // Pasted or dropped image files upload and land where they were put.
      handlePaste: (_view, event) => {
        if (!full) return false;
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        handlers.current.uploadImages(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!full || moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        handlers.current.uploadImages(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      }
    },
    onUpdate: ({ editor }) => {
      const next = fromEditor(editor, variant);
      lastEmitted.current = next;
      onChangeRef.current(next);
    }
  });

  // A new draft (or a reset) replaces the content; our own edits don't.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toEditor(value, variant), { emitUpdate: false });
  }, [editor, value, variant]);

  /* ---- Slash menu: "/" at the start of an empty line opens the block picker ---- */
  useEffect(() => {
    if (!editor || !full) return;
    const update = () => {
      const { selection } = editor.state;
      const { $from, empty } = selection;
      const text = $from.parent.type.name === "paragraph" ? $from.parent.textBetween(0, $from.parentOffset, undefined, "￼") : "";
      const match = empty && editor.isFocused ? /^\/([\p{L} ]{0,20})$/u.exec(text) : null;
      const from = $from.start();
      if (!match || dismissedSlash.current === from) {
        if (!match) dismissedSlash.current = null;
        setSlash(null);
        return;
      }
      const wrap = wrapRef.current?.getBoundingClientRect();
      const at = editor.view.coordsAtPos(from);
      setSlash((prev) => ({
        from,
        to: $from.pos,
        query: match[1].trim().toLowerCase(),
        index: prev && prev.from === from ? prev.index : 0,
        top: wrap ? at.bottom - wrap.top + 6 : 0,
        left: wrap ? at.left - wrap.left : 0
      }));
    };
    editor.on("transaction", update);
    editor.on("blur", update);
    return () => {
      editor.off("transaction", update);
      editor.off("blur", update);
    };
  }, [editor, full]);

  const slashItems = useMemo(() => {
    if (!slash) return [];
    const q = slash.query;
    return q ? SLASH_BLOCKS.filter((b) => `${b.title} ${b.keywords}`.toLowerCase().includes(q)) : SLASH_BLOCKS;
  }, [slash]);

  const openImageDialog = useCallback(() => {
    if (!editor) return;
    const attrs = editor.isActive("image") ? editor.getAttributes("image") : null;
    setImageDialog(attrs ? { src: attrs.src ?? "", alt: attrs.alt ?? "", title: attrs.title ?? "" } : "new");
  }, [editor]);

  const ui = useMemo(
    () => ({ image: () => setImageDialog("new"), chart: () => setChartDialog({ pos: null, spec: "" }) }),
    []
  );

  const runSlash = (block: BlockAction) => {
    const current = slashRef.current;
    if (!editor || !current) return;
    editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run();
    setSlash(null);
    block.run(editor, ui);
  };

  handlers.current.slashKey = (event) => {
    const current = slashRef.current;
    if (!current) return false;
    if (event.key === "Escape") {
      dismissedSlash.current = current.from;
      setSlash(null);
      return true;
    }
    if (!slashItems.length) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSlash({ ...current, index: (current.index + step + slashItems.length) % slashItems.length });
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      runSlash(slashItems[Math.min(current.index, slashItems.length - 1)]);
      return true;
    }
    return false;
  };

  /* ---- Images: upload pasted / dropped files ---- */
  const uploadImages = useCallback(
    async (files: File[], pos?: number) => {
      if (!editor) return;
      if (!isUploadConfigured()) {
        toast.error("Image uploads need the content API.");
        return;
      }
      let at = pos;
      for (const file of files) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name} is over 10 MB. Compress it and try again.`);
          continue;
        }
        setUploads((n) => n + 1);
        try {
          const { url } = await uploadMediaFile(file, "thumbnails", file.name);
          const image = { type: "image", attrs: { src: url, alt: altFromFilename(file.name), title: "" } };
          const chain = editor.chain().focus();
          (typeof at === "number" ? chain.insertContentAt(at, image) : chain.insertContent(image)).run();
          at = undefined;
        } catch (err) {
          toast.error(err instanceof Error ? `${file.name}: ${err.message}` : `Couldn't upload ${file.name}.`);
        } finally {
          setUploads((n) => n - 1);
        }
      }
    },
    [editor, toast]
  );

  const [toolbarPopover, setToolbarPopover] = useState<ToolbarPopover>(null);
  handlers.current.uploadImages = (files, pos) => void uploadImages(files, pos);
  handlers.current.editImage = openImageDialog;
  handlers.current.openLink = () => setToolbarPopover("link");

  const saveChart = (spec: string) => {
    if (!editor || !chartDialog) return;
    if (chartDialog.pos === null) {
      editor.chain().focus().insertChart(spec).run();
    } else {
      editor.chain().focus().setNodeSelection(chartDialog.pos).updateAttributes("chart", { spec }).run();
    }
    setChartDialog(null);
  };

  const saveImage = (image: { src: string; alt: string; title: string }) => {
    if (!editor) return;
    if (imageDialog && imageDialog !== "new") {
      editor.chain().focus().updateAttributes("image", image).run();
    } else {
      editor.chain().focus().setImage(image).run();
    }
    setImageDialog(null);
  };

  return (
    <div
      className={`rte rte-${variant}`}
      data-busy={uploads > 0 || undefined}
      ref={wrapRef}
      style={minHeight ? ({ "--rte-min-height": `${minHeight}px` } as React.CSSProperties) : undefined}
    >
      {editor && (
        <Toolbar
          editor={editor}
          variant={variant}
          popover={toolbarPopover}
          setPopover={setToolbarPopover}
          ui={ui}
        />
      )}
      <EditorContent className="rte-body" editor={editor} />
      {editor && <SelectionBubble editor={editor} />}

      {slash && slashItems.length > 0 && (
        <div className="rte-slash" role="listbox" aria-label="Add a block" style={{ top: slash.top, left: slash.left }}>
          <span className="rte-pop-label">{slash.query ? "Matching blocks" : "Add a block"}</span>
          {slashItems.map((block, i) => (
            <MenuItem
              highlighted={i === slash.index}
              hint={block.hint}
              icon={block.icon}
              key={block.id}
              onSelect={() => runSlash(block)}
              title={block.title}
            />
          ))}
        </div>
      )}

      {editor && <StatusBar editor={editor} variant={variant} uploads={uploads} onFixImage={openImageDialog} />}

      {/* Dialogs render into <body>: outside the content form (so Enter in them
          doesn't submit it) and outside the modal's backdrop-filter, which
          would trap position: fixed. */}
      {chartDialog &&
        createPortal(
          <ChartDialog initial={chartDialog.spec} onClose={() => setChartDialog(null)} onSave={(spec) => saveChart(stringifyChartSpec(spec))} />,
          document.body
        )}
      {imageDialog &&
        createPortal(
          <ImageDialog initial={imageDialog === "new" ? undefined : imageDialog} onClose={() => setImageDialog(null)} onSave={saveImage} />,
          document.body
        )}
    </div>
  );
};

/* ---- Floating bar over selected text ---- */

/** Text selections only: images and charts have their own actions. */
const showBubble = ({ editor, state, from, to }: { editor: Editor; state: Editor["state"]; from: number; to: number }) =>
  editor.isEditable && from !== to && !(state.selection instanceof NodeSelection);

const SelectionBubble: React.FC<{ editor: Editor }> = ({ editor }) => {
  const [panel, setPanel] = useState<"color" | "link" | null>(null);
  const close = useCallback(() => setPanel(null), []);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      color: (e.getAttributes("textColor").color as string | undefined) ?? null
    })
  });
  const chain = () => editor.chain().focus();
  // Stable props: BubbleMenu re-registers its plugin whenever these change,
  // and a new object every render would loop.
  const options = useMemo(() => ({ placement: "top" as const, offset: 8, flip: true, shift: { padding: 8 }, onHide: close }), [close]);

  return (
    <BubbleMenu className="rte-bubble" editor={editor} options={options} shouldShow={showBubble}>
      <IconButton tipBelow label="Bold" shortcut="Mod+B" active={state.bold} onClick={() => chain().toggleBold().run()} icon={<Bold size={15} />} />
      <IconButton tipBelow label="Italic" shortcut="Mod+I" active={state.italic} onClick={() => chain().toggleItalic().run()} icon={<Italic size={15} />} />
      <IconButton tipBelow label="Underline" shortcut="Mod+U" active={state.underline} onClick={() => chain().toggleUnderline().run()} icon={<Underline size={15} />} />
      <IconButton tipBelow label="Strikethrough" shortcut="Mod+Shift+S" active={state.strike} onClick={() => chain().toggleStrike().run()} icon={<Strikethrough size={15} />} />
      <span className="rte-sep" aria-hidden="true" />
      <Popover
        boundary="body"
        open={panel === "color"}
        onClose={close}
        trigger={
          <IconButton
            tipBelow
            label="Color"
            expanded={panel === "color"}
            onClick={() => setPanel((p) => (p === "color" ? null : "color"))}
            icon={<ColorGlyph color={state.color} />}
          />
        }
      >
        <ColorPanel editor={editor} onDone={close} />
      </Popover>
      <Popover
        boundary="body"
        open={panel === "link"}
        onClose={close}
        trigger={
          <IconButton
            tipBelow
            label="Link"
            shortcut="Mod+K"
            active={state.link}
            expanded={panel === "link"}
            onClick={() => setPanel((p) => (p === "link" ? null : "link"))}
            icon={<Link2 size={15} />}
          />
        }
      >
        <LinkPanel editor={editor} onDone={close} />
      </Popover>
    </BubbleMenu>
  );
};

const ColorGlyph: React.FC<{ color: string | null }> = ({ color }) => (
  <span className="rte-color-glyph">
    <Baseline size={16} />
    <i style={{ background: color ? TEXT_COLOR_HEX[color as keyof typeof TEXT_COLOR_HEX] : "var(--ink-3)" }} />
  </span>
);

/* ---- Toolbar ---- */

type ToolbarPopover = "style" | "color" | "link" | "insert" | null;

const Toolbar: React.FC<{
  editor: Editor;
  variant: RichTextVariant;
  popover: ToolbarPopover;
  setPopover: React.Dispatch<React.SetStateAction<ToolbarPopover>>;
  ui: { image: () => void; chart: () => void };
}> = ({ editor, variant, popover, setPopover, ui }) => {
  const full = variant === "full";
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 2 })
        ? "h2"
        : e.isActive("heading", { level: 3 })
          ? "h3"
          : e.isActive("bulletList")
            ? "ul"
            : e.isActive("orderedList")
              ? "ol"
              : e.isActive("blockquote")
                ? "quote"
                : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      color: (e.getAttributes("textColor").color as string | undefined) ?? null,
      link: e.isActive("link"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo()
    })
  });

  const chain = () => editor.chain().focus();
  const toggle = (open: ToolbarPopover) => setPopover((cur) => (cur === open ? null : open));
  const close = useCallback(() => setPopover(null), [setPopover]);
  const currentBlock = TEXT_BLOCKS.find((b) => b.id === state.block) ?? TEXT_BLOCKS[0];

  // Arrow keys move between toolbar controls (WAI-ARIA toolbar pattern).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.closest(".rte-pop")) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(".rte-toolbar-row .rte-btn:not(:disabled)")).filter(
      (el) => !el.closest(".rte-pop")
    );
    const index = items.indexOf(target);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting" onKeyDown={onKeyDown}>
      <div className="rte-toolbar-row">
        {full && (
          <>
            <Popover
              open={popover === "style"}
              onClose={close}
              trigger={
                <IconButton
                  className="rte-btn-labelled rte-style-trigger"
                  expanded={popover === "style"}
                  icon={currentBlock.icon}
                  label="Text style"
                  onClick={() => toggle("style")}
                >
                  <span>{currentBlock.title}</span>
                  <ChevronDown className="rte-chevron" size={14} />
                </IconButton>
              }
            >
              <div className="rte-menu" role="menu" aria-label="Text style">
                <span className="rte-pop-label">Turn into</span>
                {TEXT_BLOCKS.map((block) => (
                  <MenuItem
                    checked={block.id === state.block}
                    icon={block.icon}
                    key={block.id}
                    onSelect={() => {
                      // Lists and quotes toggle: picking the current one again shouldn't undo it.
                      if (block.id !== state.block) block.run(editor, ui);
                      close();
                    }}
                    shortcut={block.shortcut}
                    title={block.title}
                  />
                ))}
              </div>
            </Popover>
            <span className="rte-sep" aria-hidden="true" />
          </>
        )}

        <IconButton label="Bold" shortcut="Mod+B" active={state.bold} onClick={() => chain().toggleBold().run()} icon={<Bold size={16} />} />
        <IconButton label="Italic" shortcut="Mod+I" active={state.italic} onClick={() => chain().toggleItalic().run()} icon={<Italic size={16} />} />
        <IconButton label="Underline" shortcut="Mod+U" active={state.underline} onClick={() => chain().toggleUnderline().run()} icon={<Underline size={16} />} />
        <IconButton label="Strikethrough" shortcut="Mod+Shift+S" active={state.strike} onClick={() => chain().toggleStrike().run()} icon={<Strikethrough size={16} />} />

        <Popover
          open={popover === "color"}
          onClose={close}
          trigger={
            <IconButton
              label="Text color and highlight"
              expanded={popover === "color"}
              onClick={() => toggle("color")}
              icon={<ColorGlyph color={state.color} />}
            />
          }
        >
          <ColorPanel editor={editor} onDone={close} />
        </Popover>

        <Popover
          open={popover === "link"}
          onClose={close}
          trigger={
            <IconButton label="Link" shortcut="Mod+K" active={state.link} expanded={popover === "link"} onClick={() => toggle("link")} icon={<Link2 size={16} />} />
          }
        >
          <LinkPanel editor={editor} onDone={close} />
        </Popover>

        {variant === "compact" && (
          <>
            <span className="rte-sep" aria-hidden="true" />
            <IconButton label="Bulleted list" shortcut="Mod+Shift+8" active={state.bulletList} onClick={() => chain().toggleBulletList().run()} icon={<List size={16} />} />
            <IconButton label="Numbered list" shortcut="Mod+Shift+7" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()} icon={<ListOrdered size={16} />} />
          </>
        )}

        {full && (
          <>
            <span className="rte-sep" aria-hidden="true" />
            <Popover
              open={popover === "insert"}
              onClose={close}
              trigger={
                <IconButton
                  className="rte-btn-labelled rte-insert-trigger"
                  expanded={popover === "insert"}
                  icon={<Plus size={16} />}
                  label="Insert"
                  onClick={() => toggle("insert")}
                >
                  <span>Insert</span>
                  <ChevronDown className="rte-chevron" size={14} />
                </IconButton>
              }
            >
              <div className="rte-menu rte-menu-wide" role="menu" aria-label="Insert">
                <span className="rte-pop-label">Insert</span>
                {INSERT_BLOCKS.map((block) => (
                  <MenuItem
                    hint={block.hint}
                    icon={block.icon}
                    key={block.id}
                    onSelect={() => {
                      close();
                      block.run(editor, ui);
                    }}
                    title={block.title}
                  />
                ))}
                <p className="rte-menu-foot">
                  Tip: type <kbd>/</kbd> on an empty line
                </p>
              </div>
            </Popover>
          </>
        )}

        <span className="rte-spacer" />
        <IconButton label="Clear formatting" onClick={() => chain().unsetAllMarks().run()} icon={<Eraser size={16} />} />
        <IconButton label="Undo" shortcut="Mod+Z" onClick={() => chain().undo().run()} icon={<Undo2 size={16} />} disabled={!state.canUndo} />
        <IconButton label="Redo" shortcut="Mod+Shift+Z" onClick={() => chain().redo().run()} icon={<Redo2 size={16} />} disabled={!state.canRedo} />
      </div>

      {full && state.table && (
        <div className="rte-context-bar" role="group" aria-label="Table">
          <span className="rte-context-label">
            <Table2 size={14} /> Table
          </span>
          <button onClick={() => chain().addRowAfter().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            <Rows3 size={14} /> Add row
          </button>
          <button onClick={() => chain().addColumnAfter().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            <Columns3 size={14} /> Add column
          </button>
          <button onClick={() => chain().toggleHeaderRow().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            Header row
          </button>
          <button onClick={() => chain().deleteRow().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            Delete row
          </button>
          <button onClick={() => chain().deleteColumn().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            Delete column
          </button>
          <button className="is-danger" onClick={() => chain().deleteTable().run()} onMouseDown={(e) => e.preventDefault()} type="button">
            <Trash2 size={14} /> Delete table
          </button>
        </div>
      )}
    </div>
  );
};

/* ---- Status bar: length, read time, and anything to fix before saving ---- */

const StatusBar: React.FC<{ editor: Editor; variant: RichTextVariant; uploads: number; onFixImage: () => void }> = ({
  editor,
  variant,
  uploads,
  onFixImage
}) => {
  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const words = e.state.doc.textBetween(0, e.state.doc.content.size, " ", " ").split(/\s+/).filter(Boolean).length;
      let missingAlt = null as number | null;
      let missingCount = 0;
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "image" && !String(node.attrs.alt ?? "").trim()) {
          missingCount += 1;
          if (missingAlt === null) missingAlt = pos;
        }
      });
      const points = variant === "points" ? e.state.doc.childCount - (e.isEmpty ? 1 : 0) : 0;
      return { words, missingAlt, missingCount, points, focused: e.isFocused };
    }
  });

  return (
    <div className="rte-status" aria-live="polite">
      <span className="rte-status-count">
        {variant === "points"
          ? `${stats.points} ${stats.points === 1 ? "point" : "points"}`
          : `${stats.words.toLocaleString()} ${stats.words === 1 ? "word" : "words"}`}
        {variant === "full" && stats.words > 0 && <> · {Math.max(1, Math.round(stats.words / WORDS_PER_MINUTE))} min read</>}
      </span>
      {uploads > 0 && (
        <span className="rte-status-busy">
          <Loader2 className="spin-icon" size={13} /> Uploading {uploads} {uploads === 1 ? "image" : "images"}…
        </span>
      )}
      {stats.missingCount > 0 && stats.missingAlt !== null && (
        <button
          className="rte-status-warn"
          onClick={() => {
            editor.chain().focus().setNodeSelection(stats.missingAlt!).run();
            onFixImage();
          }}
          type="button"
        >
          <AlertTriangle size={13} />
          {stats.missingCount} {stats.missingCount === 1 ? "image needs" : "images need"} alt text
        </button>
      )}
      <span className="rte-status-hint">
        {variant === "points" ? (
          <>
            <kbd>Enter</kbd> adds a point
          </>
        ) : variant === "full" ? (
          <>
            <kbd>/</kbd> for blocks · select text to format
          </>
        ) : (
          <>Select text to format</>
        )}
      </span>
    </div>
  );
};
