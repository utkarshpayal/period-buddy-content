import React, { useState } from "react";
import { Loader2, X } from "lucide-react";
import { HoursRows, useOverlay } from "./controls";
import {
  DAYS,
  DateChange,
  MAX_TIME_OFF_DAYS,
  Range,
  Schedule,
  cloneRanges,
  addDays,
  daysBetween,
  defaultRange,
  firstError,
  mergeRanges,
  formatCompact,
  formatSpan,
  selectionTitle,
  slotsInDay,
  sortRanges,
  spanKeys,
  weekdayOf
} from "./model";

type Mode = "regular" | "off" | "custom";

/**
 * Side panel for the dates picked on the calendar: keep the weekly hours,
 * mark them unavailable, or give them their own hours.
 */
export const DateEditor: React.FC<{
  schedule: Schedule;
  keys: string[];
  today: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (keys: string[], change: DateChange | null) => void;
}> = ({ schedule, keys, today, saving, onCancel, onSave }) => {
  useOverlay(onCancel);
  const first = schedule.overrides[keys[0]];
  const weekly = sortRanges(schedule.week[weekdayOf(keys[0])] ?? []);
  const [mode, setMode] = useState<Mode>(first ? (first.ranges.length ? "custom" : "off") : "regular");
  const [ranges, setRanges] = useState<Range[]>(() =>
    first?.ranges.length ? cloneRanges(first.ranges) : weekly.length ? cloneRanges(weekly) : [defaultRange()]
  );
  const [note, setNote] = useState(first?.note ?? "");

  const mixed = new Set(keys.map((k) => JSON.stringify(schedule.overrides[k] ?? null))).size > 1;
  const length = schedule.consultationMinutes;
  const problem = mode === "custom" ? (ranges.length ? firstError(ranges, length) : "Add at least one time.") : null;
  const single = keys.length === 1;

  const regularHint = single
    ? weekly.length
      ? mergeRanges(weekly).map(formatCompact).join(", ")
      : `You don’t work on ${DAYS[weekdayOf(keys[0])]}s`
    : "Each date follows its weekday’s hours";

  const options: { value: Mode; title: string; hint: string }[] = [
    { value: "regular", title: "Weekly hours", hint: regularHint },
    { value: "off", title: "Unavailable", hint: "Patients can’t book this day" },
    { value: "custom", title: "Custom hours", hint: "Different hours for this day only" }
  ];

  return (
    <div className="av-scrim is-center" onMouseDown={onCancel}>
      <section className="av-modal av-editor" role="dialog" aria-modal="true" aria-label={`Edit ${selectionTitle(keys)}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="av-modal-head">
          <div>
            <p className="av-overline">{single ? "Edit date" : `${keys.length} dates selected`}</p>
            <h2>{selectionTitle(keys)}</h2>
          </div>
          <button className="av-icon" type="button" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>

        {keys.some((k) => k > addDays(today, schedule.windowDays)) && (
          <p className="av-note">
            Patients book up to {schedule.windowDays} days ahead, so they’ll see {single ? "this date" : "some of these dates"} later.
          </p>
        )}

        {mixed && <p className="av-note">These dates are set differently. Saving applies one choice to all of them.</p>}

        <div className="av-options" role="radiogroup" aria-label="Availability for the selected dates">
          {options.map((o) => (
            <label className={`av-option${mode === o.value ? " is-checked" : ""}`} key={o.value}>
              <input type="radio" name="av-date-mode" checked={mode === o.value} onChange={() => setMode(o.value)} />
              <span>
                <strong>{o.title}</strong>
                <small>{o.hint}</small>
              </span>
            </label>
          ))}
        </div>

        {mode === "custom" && (
          <div className="av-editor-hours">
            <HoursRows ranges={ranges} onChange={setRanges} length={length} label={single ? selectionTitle(keys) : "selected dates"} />
            {!problem && (
              <p className="av-help">
                {slotsInDay(ranges, length)} consultations of {length} min{single ? "" : " on each date"}
              </p>
            )}
          </div>
        )}

        {mode !== "regular" && (
          <label className="av-field">
            <span>
              Note <em>Optional · only you see this</em>
            </span>
            <input
              className="av-input"
              type="text"
              maxLength={120}
              placeholder={mode === "off" ? "e.g. Annual leave" : "e.g. Saturday clinic"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}

        <footer className="av-modal-foot">
          <button className="av-btn av-btn-secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="av-btn av-btn-primary"
            type="button"
            disabled={saving || Boolean(problem)}
            onClick={() => onSave(keys, mode === "regular" ? null : { ranges: mode === "off" ? [] : sortRanges(ranges), note: note.trim() })}
          >
            {saving && <Loader2 className="spin-icon" size={15} />} Save
          </button>
        </footer>
      </section>
    </div>
  );
};

/** Quick "away from … to …" for leave that spans weeks or months. */
/** Common time-off spans from today: today, tomorrow, the coming weekend, a week. */
const quickPicks = (today: string) => {
  const day = weekdayOf(today); // 0 = Sunday
  const saturday = addDays(today, (6 - day + 7) % 7);
  const picks = [
    { label: "Today", from: today, to: today },
    { label: "Tomorrow", from: addDays(today, 1), to: addDays(today, 1) },
    // On Saturday this is today + tomorrow; on Sunday the weekend is just
    // "Today", so it's left out rather than shown twice.
    ...(day === 0 ? [] : [{ label: "This weekend", from: saturday, to: addDays(saturday, 1) }]),
    { label: "Next 7 days", from: today, to: addDays(today, 6) }
  ];
  return picks;
};

export const TimeOffDialog: React.FC<{
  today: string;
  saving: boolean;
  onClose: () => void;
  onSave: (keys: string[], note: string) => void;
}> = ({ today, saving, onClose, onSave }) => {
  useOverlay(onClose);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const days = from && to ? daysBetween(from, to) + 1 : 0;
  const problem = !from || !to
    ? "Choose both dates."
    : from < today
      ? "Time off can’t start in the past."
      : days < 1
        ? "The last day can’t be before the first."
        : days > MAX_TIME_OFF_DAYS
          ? `Add up to ${MAX_TIME_OFF_DAYS} days at a time.`
          : null;

  return (
    <div className="av-scrim is-center" onMouseDown={onClose}>
      <form
        className="av-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="av-timeoff-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) onSave(spanKeys(from, to), note.trim());
        }}
      >
        <header className="av-modal-head">
          <h2 id="av-timeoff-title">Add time off</h2>
          <button className="av-icon" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p className="av-modal-lead">Patients won’t be able to book you on these days. Consultations already booked stay as they are.</p>
        <div className="av-quickpicks" role="group" aria-label="Quick picks">
          {quickPicks(today).map((pick) => (
            <button
              key={pick.label}
              type="button"
              className={`av-quickpick${from === pick.from && to === pick.to ? " is-active" : ""}`}
              onClick={() => {
                setFrom(pick.from);
                setTo(pick.to);
              }}
            >
              {pick.label}
            </button>
          ))}
        </div>
        <div className="av-modal-grid">
          <label className="av-field">
            <span>From</span>
            <input
              className="av-input"
              type="date"
              min={today}
              value={from}
              required
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > to) setTo(e.target.value);
              }}
            />
          </label>
          <label className="av-field">
            <span>To</span>
            <input className="av-input" type="date" min={from || today} value={to} required onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="av-field">
          <span>
            Note <em>Optional · only you see this</em>
          </span>
          <input className="av-input" type="text" maxLength={120} placeholder="e.g. Annual leave" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className={problem ? "av-row-error" : "av-help"}>{problem ?? `${days} day${days === 1 ? "" : "s"} · ${formatSpan(from, to)}`}</p>
        <footer className="av-modal-foot">
          <button className="av-btn av-btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="av-btn av-btn-primary" type="submit" disabled={saving || Boolean(problem)}>
            {saving && <Loader2 className="spin-icon" size={15} />} Add time off
          </button>
        </footer>
      </form>
    </div>
  );
};
