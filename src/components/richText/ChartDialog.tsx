import React, { useState } from "react";
import { BarChart3, LineChart, PieChart, Plus, Trash2, X } from "lucide-react";
import { ChartSpec, ChartType, emptyChart, parseChartSpec } from "../../lib/richText";
import { RichChart } from "./RichChart";

type ChartDialogProps = {
  /** Existing chart JSON when editing, empty when adding. */
  initial: string;
  onSave: (spec: ChartSpec) => void;
  onClose: () => void;
};

const TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: "bar", label: "Bar", icon: <BarChart3 size={16} /> },
  { value: "line", label: "Line", icon: <LineChart size={16} /> },
  { value: "pie", label: "Pie", icon: <PieChart size={16} /> }
];

/** Builds a chart from a small table: one row per label, one column per series. */
export const ChartDialog: React.FC<ChartDialogProps> = ({ initial, onSave, onClose }) => {
  const [spec, setSpec] = useState<ChartSpec>(() => parseChartSpec(initial) ?? emptyChart());
  // Cells are edited as text so "", "-" and "1." can be typed on the way to a number.
  const [cells, setCells] = useState<string[][]>(() => spec.series.map((s) => s.values.map(String)));

  const series = spec.type === "pie" ? spec.series.slice(0, 1) : spec.series;
  const preview: ChartSpec = {
    ...spec,
    series: spec.series.map((s, si) => ({ ...s, values: spec.labels.map((_, i) => Number(cells[si]?.[i]) || 0) }))
  };

  const set = <K extends keyof ChartSpec>(key: K, value: ChartSpec[K]) => setSpec((prev) => ({ ...prev, [key]: value }));

  const setLabel = (i: number, value: string) => set("labels", spec.labels.map((l, li) => (li === i ? value : l)));
  const setCell = (si: number, i: number, value: string) =>
    setCells((prev) => prev.map((row, ri) => (ri === si ? row.map((c, ci) => (ci === i ? value : c)) : row)));

  const addRow = () => {
    set("labels", [...spec.labels, `Item ${spec.labels.length + 1}`]);
    setCells((prev) => prev.map((row) => [...row, "0"]));
  };
  const removeRow = (i: number) => {
    set("labels", spec.labels.filter((_, li) => li !== i));
    setCells((prev) => prev.map((row) => row.filter((_, ci) => ci !== i)));
  };
  const addSeries = () => {
    set("series", [...spec.series, { name: `Series ${spec.series.length + 1}`, values: spec.labels.map(() => 0) }]);
    setCells((prev) => [...prev, spec.labels.map(() => "0")]);
  };
  const removeSeries = (si: number) => {
    set("series", spec.series.filter((_, i) => i !== si));
    setCells((prev) => prev.filter((_, i) => i !== si));
  };

  const canSave = spec.labels.length > 0 && series.length > 0;

  return (
    <div className="modal-overlay rte-dialog-overlay" data-esc-close onClick={onClose}>
      <div
        aria-labelledby="rte-chart-title"
        aria-modal="true"
        className="rte-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close" className="modal-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
        <h3 id="rte-chart-title">{initial ? "Edit chart" : "Add a chart"}</h3>

        <div className="rte-dialog-grid">
          <div className="rte-dialog-form">
            <div className="rte-segmented" role="radiogroup" aria-label="Chart type">
              {TYPES.map((t) => (
                <button
                  aria-checked={spec.type === t.value}
                  className={spec.type === t.value ? "active" : ""}
                  key={t.value}
                  onClick={() => set("type", t.value)}
                  role="radio"
                  type="button"
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <label>
              Title
              <input autoFocus onChange={(e) => set("title", e.target.value)} placeholder="Average cycle length by age" value={spec.title} />
            </label>
            <div className="rte-dialog-row">
              <label>
                Unit
                <input onChange={(e) => set("unit", e.target.value)} placeholder="%, days" value={spec.unit} />
              </label>
              <label>
                Source / note
                <input onChange={(e) => set("caption", e.target.value)} placeholder="Source: WHO, 2024" value={spec.caption} />
              </label>
            </div>

            <div className="rte-chart-table-wrap">
              <table className="rte-chart-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    {series.map((s, si) => (
                      <th key={si}>
                        <div className="rte-series-head">
                          <input
                            aria-label={`Series ${si + 1} name`}
                            onChange={(e) =>
                              set("series", spec.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)))
                            }
                            value={s.name}
                          />
                          {series.length > 1 && (
                            <button aria-label={`Remove ${s.name || "series"}`} onClick={() => removeSeries(si)} type="button">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {spec.labels.map((label, i) => (
                    <tr key={i}>
                      <td>
                        <input aria-label={`Label ${i + 1}`} onChange={(e) => setLabel(i, e.target.value)} value={label} />
                      </td>
                      {series.map((s, si) => (
                        <td key={si}>
                          <input
                            aria-label={`${s.name || `Series ${si + 1}`}, ${label}`}
                            inputMode="decimal"
                            onChange={(e) => setCell(si, i, e.target.value)}
                            value={cells[si]?.[i] ?? ""}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          aria-label={`Remove ${label || "row"}`}
                          disabled={spec.labels.length <= 1}
                          onClick={() => removeRow(i)}
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rte-dialog-actions-inline">
              <button onClick={addRow} type="button">
                <Plus size={14} /> Add row
              </button>
              {spec.type !== "pie" && (
                <button onClick={addSeries} type="button">
                  <Plus size={14} /> Add series
                </button>
              )}
            </div>
            {spec.type === "pie" && spec.series.length > 1 && (
              <p className="rte-hint">A pie chart shows the first series only.</p>
            )}
          </div>

          <div className="rte-dialog-preview">
            <span className="rte-hint">Preview</span>
            <RichChart spec={spec.type === "pie" ? { ...preview, series: preview.series.slice(0, 1) } : preview} />
          </div>
        </div>

        <div className="rte-dialog-footer">
          <button className="modal-cancel" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="save-button"
            disabled={!canSave}
            onClick={() => onSave(spec.type === "pie" ? { ...preview, series: preview.series.slice(0, 1) } : preview)}
            type="button"
          >
            {initial ? "Update chart" : "Insert chart"}
          </button>
        </div>
      </div>
    </div>
  );
};
