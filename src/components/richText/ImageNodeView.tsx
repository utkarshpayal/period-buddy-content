import React, { useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { AlertTriangle, ImageOff, PencilLine, Trash2 } from "lucide-react";

/** An image in the editor as it will read: the picture, its caption, and edit / remove on hover. */
export const ImageNodeView: React.FC<NodeViewProps> = ({ node, extension, getPos, deleteNode, selected, editor }) => {
  const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null };
  const [broken, setBroken] = useState(false);
  const edit = () => {
    const pos = getPos();
    if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).run();
    extension.options.onEdit?.();
  };

  return (
    <NodeViewWrapper as="figure" className={selected ? "rte-figure is-selected" : "rte-figure"} data-drag-handle>
      <div className="rte-figure-media">
        {broken ? (
          <div className="rte-figure-broken">
            <ImageOff size={20} />
            <span>This image couldn't be loaded. Check the link, or replace it.</span>
          </div>
        ) : (
          <img alt={alt ?? ""} draggable={false} onError={() => setBroken(true)} src={src} />
        )}
        {editor.isEditable && (
          <div className="rte-block-actions" contentEditable={false}>
            <button onClick={edit} onMouseDown={(e) => e.preventDefault()} type="button">
              <PencilLine size={14} /> Edit
            </button>
            <button aria-label="Remove image" onClick={deleteNode} onMouseDown={(e) => e.preventDefault()} type="button">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {title ? (
        <figcaption>{title}</figcaption>
      ) : editor.isEditable ? (
        <button className="rte-figure-add" contentEditable={false} onClick={edit} onMouseDown={(e) => e.preventDefault()} type="button">
          Add a caption
        </button>
      ) : null}
      {editor.isEditable && !String(alt ?? "").trim() && (
        <button className="rte-figure-alert" contentEditable={false} onClick={edit} onMouseDown={(e) => e.preventDefault()} type="button">
          <AlertTriangle size={13} /> Add alt text so screen readers can describe this image
        </button>
      )}
    </NodeViewWrapper>
  );
};
