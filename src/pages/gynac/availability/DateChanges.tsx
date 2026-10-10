import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import {
  CALENDAR_MONTHS_AHEAD,
  DAYS,
  DAYS_SHORT,
  Schedule,
  WEEK_ORDER,
  addDays,
  addMonths,
  daysBetween,
  formatClock,
  formatCompact,
  formatKey,
  formatSpan,
  groupChanges,
  hoursOn,
  mergeRanges,
  relativeDay,
  spanKeys,
  weekdayOf
} from "./model";

/**
 * Date-specific hours: a month to pick dates on (click, or drag across a
 * run of days) beside the list of upcoming changes and time off.
 */
export const DateChanges: React.FC<{
  schedule: Schedule;
  today: string;
  saving: boolean;
  onEdit: (keys: string[]) => void;
  onReset: (keys: string[]) => void;
  onTimeOff: () => void;
}> = ({ schedule, today, saving, onEdit, onReset, onTimeOff }) => {
  const groups = useMemo(() => groupChanges(schedule.overrides, today), [schedule.overrides, today]);
  const [month, setMonth] = useState(today.slice(0, 7));

  return (
    <section className="av-card av-dates" aria-label="Date-specific hours">
      <header className="av-card-head">
        <div>
          <h2>Date-specific hours</h2>
          <p>Change a day without touching your weekly hours. Pick a date (drag across dates to pick several), or add time off for a longer break.</p>
        </div>
        <div className="av-card-tools">
          <button className="av-btn av-btn-secondary av-btn-sm" type="button" onClick={onTimeOff}>
            <CalendarOff size={15} /> Add time off
          </button>
        </div>
      </header>

      <div className="av-dc">
        <MiniMonth schedule={schedule} today={today} month={month} onMonth={setMonth} onPick={onEdit} />

        <div className="av-dc-list">
          <p className="av-dc-count">
            {groups.length ? `${groups.length} upcoming change${groups.length === 1 ? "" : "s"}` : "Upcoming changes"}
          </p>
          {groups.length ? (
            <ul>
              {groups.map((g) => {
                const first = g.keys[0];
                const last = g.keys[g.keys.length - 1];
                const ranges = schedule.overrides[first].ranges;
                return (
                  <li key={first} className={g.off ? "is-off" : "is-custom"}>
                    <button className="av-dc-date" type="button" onClick={() => setMonth(first.slice(0, 7))} title="Show on calendar">
                      <small>{formatKey(first, { month: "short" })}</small>
                      <strong>{Number(first.slice(8))}</strong>
                    </button>
                    <div className="av-dc-what">
                      <strong>
                        {g.keys.length === 1 ? relativeDay(first, today) : formatSpan(first, last)}
                        <span className={`av-tag ${g.off ? "is-off" : "is-custom"}`}>{g.off ? "Time off" : "Custom hours"}</span>
                      </strong>
                      <small>
                        {g.keys.length > 1 && `${g.keys.length} days · `}
                        {g.off ? "No bookings" : mergeRanges(ranges).map(formatCompact).join(", ")}
                        {g.note && ` · ${g.note}`}
                      </small>
                    </div>
                    <div className="av-dc-actions">
                      <button className="av-icon" type="button" title="Edit" aria-label={`Edit ${formatSpan(first, last)}`} onClick={() => onEdit(g.keys)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="av-icon"
                        type="button"
                        title="Back to weekly hours"
                        aria-label={`Use weekly hours on ${formatSpan(first, last)}`}
                        disabled={saving}
                        onClick={() => onReset(g.keys)}
                      >
                        <RotateCcw size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="av-dc-empty">
              <CalendarOff size={22} aria-hidden />
              <strong>No date changes yet</strong>
              <p>Holidays, a conference, or a one-off Saturday clinic: pick the dates on the calendar to set them.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/** Compact month. Press on a date and drag to select a run of days; release to edit them. */
const MiniMonth: React.FC<{
  schedule: Schedule;
  today: string;
  month: string;
  onMonth: (month: string) => void;
  onPick: (keys: string[]) => void;
}> = ({ schedule, today, month, onMonth, onPick }) => {
  const [range, setRange] = useState<[string, string] | null>(null);
  const live = useRef<[string, string] | null>(null);
  live.current = range;
  const pick = useRef(onPick);
  pick.current = onPick;
  const pressing = range !== null;

  const first = `${month}-01`;
  const start = addDays(first, -((weekdayOf(first) + 6) % 7));
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = Math.ceil((daysBetween(start, first) + daysInMonth) / 7) * 7;
  const minMonth = today.slice(0, 7);
  const maxMonth = addMonths(minMonth, CALENDAR_MONTHS_AHEAD);
  const lastBookable = addDays(today, schedule.windowDays);
  const [lo, hi] = range ? (range[0] <= range[1] ? range : [range[1], range[0]]) : ["", ""];

  useEffect(() => {
    if (!pressing) return;
    const up = () => {
      const r = live.current;
      setRange(null);
      if (r) pick.current(spanKeys(...((r[0] <= r[1] ? r : [r[1], r[0]]) as [string, string])));
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [pressing]);

  return (
    <div className="av-mm">
      <header className="av-mm-bar">
        <strong>{formatKey(first, { month: "long", year: "numeric" })}</strong>
        <span>
          <button className="av-icon" type="button" aria-label="Previous month" disabled={month <= minMonth} onClick={() => onMonth(addMonths(month, -1))}>
            <ChevronLeft size={17} />
          </button>
          <button className="av-icon" type="button" aria-label="Next month" disabled={month >= maxMonth} onClick={() => onMonth(addMonths(month, 1))}>
            <ChevronRight size={17} />
          </button>
        </span>
      </header>
      <div className="av-mm-grid" role="grid" aria-label={formatKey(first, { month: "long", year: "numeric" })}>
        {WEEK_ORDER.map((d) => (
          <span className="av-mm-dow" key={d} role="columnheader" aria-label={DAYS[d]}>
            {DAYS_SHORT[d].slice(0, 2)}
          </span>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const key = addDays(start, i);
          const past = key < today;
          const { status, ranges } = hoursOn(schedule, key);
          const describe =
            status === "off" ? "time off" : status === "closed" ? "not working" : ranges.map((r) => `${formatClock(r.startTime)} to ${formatClock(r.endTime)}`).join(", ");
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              disabled={past}
              aria-label={`${DAYS[weekdayOf(key)]} ${formatKey(key, { day: "numeric", month: "long" })}: ${describe}`}
              className={[
                "av-mm-day",
                `is-${status}`,
                key.slice(0, 7) === month ? "" : "is-outside",
                past ? "is-past" : "",
                key === today ? "is-today" : "",
                !past && key > lastBookable ? "is-later" : "",
                range && key >= lo && key <= hi ? "is-selected" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={(e) => {
                if (past || e.button !== 0) return;
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                setRange([key, key]);
              }}
              onPointerEnter={() => range && !past && setRange([range[0], key])}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick([key]))}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>
      <footer className="av-mm-key">
        <span>
          <i className="is-custom" /> Custom
        </span>
        <span>
          <i className="is-off" /> Time off
        </span>
        <span>
          <i className="is-later" /> Not bookable yet
        </span>
      </footer>
    </div>
  );
};
