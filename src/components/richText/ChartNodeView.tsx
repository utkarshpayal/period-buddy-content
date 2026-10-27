import React from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { BarChart3, PencilLine, Trash2 } from "lucide-react";
import { parseChartSpec } from "../../lib/richText";
import { RichChart } from "./RichChart";

export const ChartNodeView: React.FC<NodeViewProps> = ({ node, extension, getPos, deleteNode, selected, editor }) => {
  const spec = parseChartSpec(node.attrs.spec);
  const edit = () => {
    const pos = getPos();
    if (typeof pos === "number") extension.options.onEdit?.(pos, node.attrs.spec);
  };

  return (
    <NodeViewWrapper className={selected ? "rte-chart is-selected" : "rte-chart"} data-drag-handle onDoubleClick={edit}>
      {spec ? (
        <RichChart spec={spec} />
      ) : (
        <div className="rte-chart-broken">
          <BarChart3 size={18} />
          This chart's data can't be read. Edit it to fix it, or remove it.
        </div>
      )}
      {editor.isEditable && (
        <div className="rte-block-actions" contentEditable={false}>
          <button onClick={edit} onMouseDown={(e) => e.preventDefault()} type="button">
            <PencilLine size={14} /> Edit data
          </button>
          <button aria-label="Remove chart" onClick={deleteNode} onMouseDown={(e) => e.preventDefault()} type="button">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
};
