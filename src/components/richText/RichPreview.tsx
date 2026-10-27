import React, { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { BlockImage, ChartBlock, HighlightMark, TextColorMark } from "./extensions";

/**
 * Rich content shown read-only, through the same schema and node views as the
 * editor, so the preview matches what was written: colors, images with
 * captions, tables and charts.
 */
export const RichPreview: React.FC<{ content: string }> = ({ content }) => {
  // Re-parse after typing pauses, not on every keystroke.
  const [shown, setShown] = useState(content);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(content), 200);
    return () => window.clearTimeout(t);
  }, [content]);

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } }),
      TextColorMark,
      HighlightMark,
      Markdown.configure({ html: true }),
      BlockImage,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      ChartBlock
    ],
    content,
    editorProps: { attributes: { class: "rte-content rte-preview-content", "aria-label": "Preview" } }
  });

  useEffect(() => {
    editor?.commands.setContent(shown, { emitUpdate: false });
  }, [editor, shown]);

  return <EditorContent className="rte-preview" editor={editor} />;
};
