import React, { useEffect, useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { MAX_RANGES_PER_DAY, Range, formatClock, minutes, nextRange, rangeErrors, toTime } from "./model";

/** Closes on Escape and locks page scroll while an overlay is open. */
export const useOverlay = (onClose: () => void) => {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);
};

/** Every quarter hour of the day, plus the current value if it's off-grid. */
const QUARTERS = Array.from({ length: 96 }, (_, i) => toTime(i * 15));

export const TimeSelect: React.FC<{ value: string; onChange: (v: string) => void; label: string; invalid?: boolean }> = ({
  value,
  onChange,
  label,
  invalid
}) => {
  const options = QUARTERS.includes(value) ? QUARTERS : [...QUARTERS, value].sort((a, b) => minutes(a) - minutes(b));
  return (
    <select className={`av-select av-time${invalid ? " is-invalid" : ""}`} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => (
        <option key={t} value={t}>
          {formatClock(t)}
        </option>
      ))}
    </select>
  );
};

export const Switch: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`av-switch${checked ? " is-on" : ""}`} onClick={onChange}>
    <span />
  </button>
);

/**
 * One day's hours as rows: [9:00 AM] – [1:00 PM] [remove]. `trailing` is
 * extra content for the first row (e.g. the weekly editor's copy button).
 */
export const HoursRows: React.FC<{
  ranges: Range[];
  onChange: (ranges: Range[]) => void;
  length: number;
  label: string;
  trailing?: React.ReactNode;
}> = ({ ranges, onChange, length, label, trailing }) => {
  const errors = rangeErrors(ranges, length);
  const update = (idx: number, patch: Partial<Range>) => onChange(ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const canAdd = ranges.length < MAX_RANGES_PER_DAY;

  return (
    <div className="av-hours">
      {ranges.map((r, idx) => (
        <div className="av-hours-row" key={idx}>
          <div className="av-hours-times">
            <TimeSelect label={`${label} from`} value={r.startTime} invalid={Boolean(errors[idx])} onChange={(v) => update(idx, { startTime: v })} />
            <span className="av-hours-dash" aria-hidden>
              –
            </span>
            <TimeSelect label={`${label} to`} value={r.endTime} invalid={Boolean(errors[idx])} onChange={(v) => update(idx, { endTime: v })} />
          </div>
          <div className="av-hours-tools">
            {idx === 0 ? (
              <>
                <button
                  className="av-icon"
                  type="button"
                  aria-label={`Add hours on ${label}`}
                  title="Add hours"
                  disabled={!canAdd}
                  onClick={() => onChange([...ranges, nextRange(ranges)])}
                >
                  <Plus size={16} />
                </button>
                {trailing}
              </>
            ) : (
              <button
                className="av-icon"
                type="button"
                aria-label={`Remove ${formatClock(r.startTime)} to ${formatClock(r.endTime)} on ${label}`}
                title="Remove"
                onClick={() => onChange(ranges.filter((_, i) => i !== idx))}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {errors[idx] && <p className="av-row-error">{errors[idx]}</p>}
        </div>
      ))}
    </div>
  );
};

/** Right-hand slide-over panel with a sticky header and footer. */
export const Drawer: React.FC<{
  title: string;
  description?: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ title, description, onClose, footer, children, wide }) => {
  useOverlay(onClose);
  return (
    <div className="av-scrim" onMouseDown={onClose}>
      <aside className={`av-drawer${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="av-drawer-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="av-icon" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="av-drawer-body">{children}</div>
        <footer className="av-drawer-foot">{footer}</footer>
      </aside>
    </div>
  );
};
