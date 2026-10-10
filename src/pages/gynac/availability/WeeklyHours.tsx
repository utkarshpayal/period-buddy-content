import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Eraser, ListChecks, Plus, Trash2, Wand2 } from "lucide-react";
import { Switch, TimeSelect } from "./controls";
import {
  DAYS,
  DAYS_SHORT,
  MAX_RANGES_PER_DAY,
  Range,
  WEEK_ORDER,
  WeekMap,
  cloneRanges,
  defaultRange,
  formatClock,
  formatCompact,
  formatDuration,
  mergeRanges,
  minutes,
  nextRange,
  rangeErrors,
  slotsInDay,
  sortRanges,
  viewBounds
} from "./model";

const NARROW = "(max-width: 720px)";
/** True on phone-sized screens, where exact times open in a bottom sheet. */
const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const update = () => setNarrow(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Common schedules, one click away. Applied as a draft like any other edit. */
const PRESETS: { id: string; label: string; hint: string; days: number[]; ranges: Range[] }[] = [
  {
    id: "weekdays",
    label: "Weekdays, 9 – 5",
    hint: "Mon–Fri · lunch 1–2",
    days: [1, 2, 3, 4, 5],
    ranges: [
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "17:00" }
    ]
  },
  { id: "six-day", label: "Mon–Sat, 10 – 6", hint: "Six days a week", days: [1, 2, 3, 4, 5, 6], ranges: [{ startTime: "10:00", endTime: "18:00" }] },
  { id: "mornings", label: "Weekday mornings", hint: "Mon–Fri · 9 AM – 1 PM", days: [1, 2, 3, 4, 5], ranges: [{ startTime: "09:00", endTime: "13:00" }] },
  { id: "evenings", label: "Weekday evenings", hint: "Mon–Fri · 5 – 9 PM", days: [1, 2, 3, 4, 5], ranges: [{ startTime: "17:00", endTime: "21:00" }] }
];

const presetWeek = (preset: (typeof PRESETS)[number]): WeekMap =>
  Object.fromEntries(preset.days.map((d) => [d, cloneRanges(preset.ranges)]));

type Editing = { day: number; index: number; rect: DOMRect };

/**
 * The weekly hours, one row per weekday: an on/off switch, the day's hours
 * as chips (click one for exact times, or add more), and a bar showing where
 * they fall in the day. Edits go to the caller's draft.
 */
export const WeeklyHours: React.FC<{
  week: WeekMap;
  onChange: (week: WeekMap) => void;
  length: number;
  todayDay: number;
  now: number;
  onEditAsList: () => void;
}> = ({ week, onChange, length, todayDay, now, onEditAsList }) => {
  const narrow = useNarrow();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const empty = WEEK_ORDER.every((d) => !(week[d] ?? []).length);
  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    onChange(presetWeek(preset));
    setPresetsOpen(false);
  };
  // Hours a day had before it was switched off, so switching back restores them.
  const remembered = useRef<Record<number, Range[]>>({});
  const [from, to] = viewBounds(week);
  const pct = (m: number) => `${((clamp(m, from, to) - from) / (to - from)) * 100}%`;

  // Back-to-back hours read as one chip.
  const rangesOf = (day: number) => mergeRanges(week[day] ?? []);
  const setDay = (day: number, ranges: Range[]) => {
    const next = { ...week };
    if (ranges.length) next[day] = sortRanges(ranges);
    else delete next[day];
    onChange(next);
  };

  const toggleDay = (day: number) => {
    const ranges = rangesOf(day);
    if (ranges.length) {
      remembered.current[day] = cloneRanges(ranges);
      setDay(day, []);
    } else setDay(day, remembered.current[day] ?? [defaultRange()]);
  };

  /** Add hours after the day's last ones (or in a free gap) and open them. */
  const addAndEdit = (day: number, ranges: Range[], el: HTMLElement) => {
    const added = ranges.length ? nextRange(ranges) : defaultRange();
    const next = mergeRanges([...ranges, added]);
    setDay(day, next);
    setEditing({
      day,
      index: next.findIndex((r) => minutes(r.startTime) <= minutes(added.startTime) && minutes(r.endTime) >= minutes(added.endTime)),
      rect: el.getBoundingClientRect()
    });
  };

  return (
    <section className="av-card av-tl" aria-label="Weekly hours">
      <header className="av-card-head">
        <div>
          <h2>Weekly hours</h2>
          <p>Your regular hours, every week. Click a time to change it, or add more hours to a day.</p>
        </div>
        <div className="av-card-tools">
          {!empty && (
            <span className="av-menu-host">
              <button
                className="av-btn av-btn-secondary av-btn-sm"
                type="button"
                aria-expanded={presetsOpen}
                aria-controls="av-preset-menu"
                onClick={() => setPresetsOpen((o) => !o)}
              >
                <Wand2 size={14} /> Quick setup
              </button>
              {presetsOpen && (
                <PresetMenu
                  onClose={() => setPresetsOpen(false)}
                  onPick={applyPreset}
                  onClear={() => {
                    onChange({});
                    setPresetsOpen(false);
                    // The button goes away with the hours: land on the first template.
                    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".av-preset")?.focus(), 0);
                  }}
                />
              )}
            </span>
          )}
          <button className="av-icon" type="button" title="Edit as a list" aria-label="Edit weekly hours as a list" onClick={onEditAsList}>
            <ListChecks size={17} />
          </button>
        </div>
      </header>

      {empty && (
        <div className="av-quickstart">
          <div className="av-quickstart-head">
            <Wand2 size={18} aria-hidden />
            <div>
              <strong>Start with a common schedule</strong>
              <span>Pick one, adjust any day below, then save. Or set each day yourself.</span>
            </div>
          </div>
          <div className="av-quickstart-grid">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className="av-preset" onClick={() => applyPreset(preset)}>
                <strong>{preset.label}</strong>
                <span>{preset.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="av-days">
        {WEEK_ORDER.map((day) => {
          const ranges = rangesOf(day);
          const on = ranges.length > 0;
          const errors = rangeErrors(ranges, length);
          const slots = slotsInDay(ranges, length);
          const total = ranges.reduce((sum, r) => sum + minutes(r.endTime) - minutes(r.startTime), 0);
          const isToday = day === todayDay;
          return (
            <div className={`av-tlm${on ? "" : " is-off"}${isToday ? " is-today" : ""}`} key={day}>
              <div className="av-tlm-head">
                <Switch checked={on} label={`Available on ${DAYS[day]}`} onChange={() => toggleDay(day)} />
                <span>
                  <strong>
                    {DAYS[day]}
                    {isToday && <em>Today</em>}
                  </strong>
                  <small>{on ? `${slots} slots · ${formatDuration(total).replace(" h", "h").replace(" min", "m")}` : "Unavailable"}</small>
                </span>
              </div>

              <div className="av-tlm-main">
                {on ? (
                  <>
                    <div className="av-tlm-chips">
                      {ranges.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`av-tlm-chip${errors[i] ? " is-invalid" : ""}${editing?.day === day && editing.index === i ? " is-active" : ""}`}
                          aria-label={`Edit ${DAYS[day]} ${formatClock(r.startTime)} to ${formatClock(r.endTime)}`}
                          title={errors[i]}
                          onClick={(e) => setEditing({ day, index: i, rect: e.currentTarget.getBoundingClientRect() })}
                        >
                          {formatCompact(r)}
                        </button>
                      ))}
                      {ranges.length < MAX_RANGES_PER_DAY && (
                        <button type="button" className="av-tlm-chip is-add" aria-label={`Add hours on ${DAYS[day]}`} onClick={(e) => addAndEdit(day, ranges, e.currentTarget)}>
                          <Plus size={14} /> Add
                        </button>
                      )}
                    </div>
                    <div className="av-tlm-bar" aria-hidden>
                      {ranges.map((r, i) => (
                        <i
                          key={i}
                          className={errors[i] ? "is-invalid" : ""}
                          style={{ left: pct(minutes(r.startTime)), right: `calc(100% - ${pct(minutes(r.endTime))})` }}
                        />
                      ))}
                      {isToday && now >= from && now <= to && <b style={{ left: pct(now) }} />}
                    </div>
                  </>
                ) : (
                  <button type="button" className="av-tlm-chip is-add" aria-label={`Add hours on ${DAYS[day]}`} onClick={() => toggleDay(day)}>
                    <Plus size={14} /> Add hours
                  </button>
                )}
              </div>

              <div className="av-tlm-tools">
                {on && (
                  <span className="av-menu-host">
                    <button
                      className="av-icon"
                      type="button"
                      title="Copy to other days"
                      aria-label={`Copy ${DAYS[day]}’s hours to other days`}
                      aria-expanded={copyFrom === day}
                      onClick={() => setCopyFrom(copyFrom === day ? null : day)}
                    >
                      <Copy size={15} />
                    </button>
                    {copyFrom === day && (
                      <CopyMenu
                        day={day}
                        onClose={() => setCopyFrom(null)}
                        onApply={(days) => {
                          const next = { ...week };
                          for (const d of days) next[d] = cloneRanges(ranges);
                          onChange(next);
                          setCopyFrom(null);
                        }}
                      />
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && rangesOf(editing.day)[editing.index] && (
        <BlockPopover
          key={`${editing.day}-${editing.index}`}
          sheet={narrow}
          day={editing.day}
          rect={editing.rect}
          range={rangesOf(editing.day)[editing.index]}
          error={rangeErrors(rangesOf(editing.day), length)[editing.index]}
          length={length}
          onChange={(r) => {
            const next = rangesOf(editing.day);
            next[editing.index] = r;
            // Keep the popover on the same hours after re-sorting, and on the
            // merged block if this edit joined two blocks together.
            const sorted = sortRanges(next);
            setDay(editing.day, sorted);
            const shown = mergeRanges(sorted);
            const index = shown.findIndex(
              (x) => minutes(x.startTime) <= minutes(r.startTime) && minutes(x.endTime) >= minutes(r.endTime)
            );
            setEditing({ ...editing, index: index >= 0 ? index : sorted.indexOf(r) });
          }}
          onDelete={() => {
            setDay(
              editing.day,
              rangesOf(editing.day).filter((_, k) => k !== editing.index)
            );
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
};

/** Exact times for one chip: a popover under it, or a bottom sheet on phones. */
const BlockPopover: React.FC<{
  sheet: boolean;
  day: number;
  rect: DOMRect;
  range: Range;
  error?: string;
  length: number;
  onChange: (r: Range) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ sheet, day, rect, range, error, length, onChange, onDelete, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: rect.bottom + 8, left: rect.left });

  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 300;
    const h = ref.current?.offsetHeight ?? 200;
    const below = rect.bottom + 8 + h < window.innerHeight;
    setPos({
      top: below ? rect.bottom + 8 : Math.max(8, rect.top - h - 8),
      left: clamp(rect.left + rect.width / 2 - w / 2, 8, window.innerWidth - w - 8)
    });
  }, [rect]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    // A floating popover would drift from its block; a sheet stays put.
    if (!sheet) {
      window.addEventListener("scroll", onClose, true);
      window.addEventListener("resize", onClose);
    }
    const overflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, sheet]);

  const pop = (
    <div className={`av-pop${sheet ? " is-sheet" : ""}`} ref={ref} role="dialog" aria-label={`Edit ${DAYS[day]} hours`} style={sheet ? undefined : { top: pos.top, left: pos.left }}>
      {sheet && <span className="av-pop-grip" aria-hidden />}
      <p className="av-pop-title">{DAYS[day]}</p>
      <div className="av-pop-times">
        <TimeSelect label="From" value={range.startTime} invalid={Boolean(error)} onChange={(v) => onChange({ ...range, startTime: v })} />
        <span aria-hidden>–</span>
        <TimeSelect label="To" value={range.endTime} invalid={Boolean(error)} onChange={(v) => onChange({ ...range, endTime: v })} />
      </div>
      <p className={error ? "av-row-error" : "av-help"}>{error ?? `${slotsInDay([range], length)} consultations of ${length} min`}</p>
      <footer>
        <button className="av-btn av-btn-ghost-danger" type="button" onClick={onDelete}>
          <Trash2 size={15} /> Remove
        </button>
        <button className="av-btn av-btn-primary av-btn-sm" type="button" onClick={onClose}>
          Done
        </button>
      </footer>
    </div>
  );
  return sheet ? (
    <>
      <div className="av-pop-scrim" aria-hidden />
      {pop}
    </>
  ) : (
    pop
  );
};

export const CopyMenu: React.FC<{ day: number; onApply: (days: number[]) => void; onClose: () => void }> = ({ day, onApply, onClose }) => {
  const [days, setDays] = useState<number[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const others = WEEK_ORDER.filter((d) => d !== day);

  useEffect(() => {
    // The parent also holds the toggle button, which closes the menu itself.
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="av-menu" ref={ref} role="dialog" aria-label={`Copy ${DAYS[day]}’s hours`}>
      <p>Copy {DAYS_SHORT[day]} to</p>
      <label className="av-check is-all">
        <input type="checkbox" checked={days.length === others.length} onChange={() => setDays(days.length === others.length ? [] : others)} />
        All days
      </label>
      {others.map((d) => (
        <label className="av-check" key={d}>
          <input type="checkbox" checked={days.includes(d)} onChange={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))} />
          {DAYS[d]}
        </label>
      ))}
      <button className="av-btn av-btn-primary av-btn-block av-btn-sm" type="button" disabled={!days.length} onClick={() => onApply(days)}>
        Apply
      </button>
    </div>
  );
};

/** Replace the whole week with a common schedule, or clear it. */
const PresetMenu: React.FC<{
  onPick: (preset: (typeof PRESETS)[number]) => void;
  onClear: () => void;
  onClose: () => void;
}> = ({ onPick, onClear, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="av-menu av-preset-menu" ref={ref} id="av-preset-menu" role="group" aria-label="Quick setup">
      <p>Replace your week with</p>
      {PRESETS.map((preset) => (
        <button key={preset.id} type="button" className="av-preset-item" onClick={() => onPick(preset)}>
          <strong>{preset.label}</strong>
          <span>{preset.hint}</span>
        </button>
      ))}
      <button type="button" className="av-preset-item is-danger" onClick={onClear}>
        <strong>
          <Eraser size={14} /> Clear all days
        </strong>
        <span>Start from an empty week</span>
      </button>
      <small>Nothing changes until you save.</small>
    </div>
  );
};
