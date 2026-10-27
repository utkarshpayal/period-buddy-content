import { Mark, Node } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { HighlightColor, TextColor, isHighlightColor, isTextColor } from "../../lib/richText";
import { ChartNodeView } from "./ChartNodeView";
import { ImageNodeView } from "./ImageNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: TextColor) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    highlight: {
      setHighlight: (color: HighlightColor) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
    chart: {
      insertChart: (spec: string) => ReturnType;
    };
  }
}

// Marks with no markdown serializer of their own are written as their HTML
// (tiptap-markdown's html mode), so these become <span data-color="…"> and
// <mark data-color="…">: the allowlist in lib/richText.ts.

// A higher priority puts these marks outside bold/italic, so a colored phrase
// with a bold word is written as one <span>, not one per run.
export const TextColorMark = Mark.create({
  name: "textColor",
  priority: 1100,
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-color"),
        renderHTML: (attrs) => ({ "data-color": attrs.color })
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-color]", getAttrs: (el) => (isTextColor(el.getAttribute("data-color")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setTextColor: (color) => ({ commands }) => commands.setMark(this.name, { color }),
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name)
    };
  }
});

export const HighlightMark = Mark.create({
  name: "highlight",
  priority: 1100,
  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el) => el.getAttribute("data-color"),
        renderHTML: (attrs) => ({ "data-color": attrs.color })
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: "mark",
        getAttrs: (el) => {
          const color = el.getAttribute("data-color");
          return !color || isHighlightColor(color) ? null : false;
        }
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setHighlight: (color) => ({ commands }) => commands.setMark(this.name, { color }),
      unsetHighlight: () => ({ commands }) => commands.unsetMark(this.name)
    };
  }
});

/** Images as their own block, written as ![alt](src "caption"). */
export const BlockImage = Image.extend<ImageOptions & { onEdit: (() => void) | null }>({
  draggable: true,
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), onEdit: null };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const esc = (s: string) => s.replace(/[\]\\[]/g, "\\$&");
          const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
          const src = String(node.attrs.src).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
          state.write(`![${esc(node.attrs.alt || "")}](${src}${title})`);
          state.closeBlock(node);
        },
        parse: {}
      }
    };
  }
}).configure({ inline: false, allowBase64: false });

export type ChartEditHandler = (pos: number, spec: string) => void;

/** A chart block, stored as ```chart + ChartSpec JSON. */
export const ChartBlock = Node.create<{ onEdit: ChartEditHandler | null }>({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return { onEdit: null };
  },
  addAttributes() {
    return {
      spec: {
        default: "",
        // null (not "") so the <pre> rule's getAttrs value isn't overwritten.
        parseHTML: (el) => el.getAttribute("data-chart"),
        renderHTML: (attrs) => ({ "data-chart": attrs.spec })
      }
    };
  },
  parseHTML() {
    return [
      {
        // markdown-it renders the fence as <pre><code class="language-chart">.
        tag: "pre",
        priority: 100,
        getAttrs: (el) => {
          const code = el.querySelector("code.language-chart");
          return code ? { spec: (code.textContent ?? "").trim() } : false;
        }
      },
      { tag: "div[data-chart]" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },
  addCommands() {
    return {
      insertChart: (spec) => ({ commands }) => commands.insertContent({ type: this.name, attrs: { spec } })
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.write("```chart\n");
          state.text(node.attrs.spec, false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {}
      }
    };
  }
});
