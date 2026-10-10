import React, { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { browserTimeZone } from "../../../api/doctorApi";
import { Drawer, HoursRows, Switch } from "./controls";
import { CopyMenu } from "./WeeklyHours";
import {
  COMMON_ZONES,
  DAYS,
  LENGTH_OPTIONS,
  NOTICE_OPTIONS,
  Schedule,
  WEEK_ORDER,
  WINDOW_OPTIONS,
  WeekMap,
  addDays,
  cloneRanges,
  defaultRange,
  formatClock,
  formatDuration,
  formatNotice,
  nextOpening,
  rangeErrors,
  relativeDay,
  shortDate,
  slotsInDay,
  weekMinutes,
  zoneLabel
} from "./model";

/* ------------------------------------------------------------------------ */
/* Overview                                                                 */
/* ------------------------------------------------------------------------ */

/** Whether patients can book right now, and what the saved hours add up to. */
export const Overview: React.FC<{ schedule: Schedule; today: string; now: number; onSetup?: () => void }> = ({
  schedule,
  today,
  now,
  onSetup
}) => {
  const next = nextOpening(schedule, today, now);
  const perWeek = WEEK_ORDER.reduce((sum, d) => sum + slotsInDay(schedule.week[d] ?? [], schedule.consultationMinutes), 0);
  const live = perWeek > 0;
  return (
    <section className="av-card av-overview" aria-label="Overview">
      <p className={`av-status${live ? " is-live" : ""}`}>
        <i aria-hidden /> {live ? "Taking bookings" : "Not taking bookings"}
      </p>
      <div className="av-next">
        <small>Next open time</small>
        {next ? (
          <strong>
            {relativeDay(next.key, today)} · {formatClock(next.time)}
          </strong>
        ) : (
          <strong className="is-none">{live ? `None in the next ${schedule.windowDays} days` : "Add weekly hours"}</strong>
        )}
      </div>
      {!live && onSetup && (
        <button className="av-btn av-btn-primary av-btn-sm av-btn-block" type="button" onClick={onSetup}>
          Set your weekly hours
        </button>
      )}
      <dl className="av-stats">
        <div>
          <dt>Slots/wk</dt>
          <dd>{perWeek}</dd>
        </div>
        <div>
          <dt>Hours/wk</dt>
          <dd>{formatDuration(weekMinutes(schedule.week)).replace(" min", "m").replace(" h", "h")}</dd>
        </div>
        <div>
          <dt>Open until</dt>
          <dd>{shortDate(addDays(today, schedule.windowDays)).replace(/^\w+, /, "")}</dd>
        </div>
      </dl>
    </section>
  );
};

/* ------------------------------------------------------------------------ */
/* Booking rules (save on change)                                           */
/* ------------------------------------------------------------------------ */

type Settings = Pick<Schedule, "consultationMinutes" | "windowDays" | "noticeMinutes" | "timezone">;

const withCurrent = (list: number[], value: number) => [...new Set([...list, value])].sort((a, b) => a - b);

export const BookingRules: React.FC<{
  schedule: Schedule;
  today: string;
  maxWindow: number;
  saving: boolean;
  onSave: (settings: Partial<Settings>, message: string) => void;
}> = ({ schedule, today, maxWindow, saving, onSave }) => {
  const [lengthError, setLengthError] = useState<string | null>(null);
  const zones = useMemo(() => {
    const list = [...COMMON_ZONES];
    for (const z of [browserTimeZone(), schedule.timezone]) if (z && !list.includes(z)) list.unshift(z);
    return list;
  }, [schedule.timezone]);

  const pickLength = (n: number) => {
    // A longer consultation may no longer fit in short hours.
    const tooShort = WEEK_ORDER.find((d) => Object.keys(rangeErrors(schedule.week[d] ?? [], n)).length > 0);
    if (tooShort !== undefined) {
      setLengthError(`Some ${DAYS[tooShort]} hours are shorter than ${n} min. Lengthen them first.`);
      return;
    }
    setLengthError(null);
    onSave({ consultationMinutes: n }, `Consultations are now ${formatDuration(n)}.`);
  };

  return (
    <section className="av-card av-rules" aria-label="Booking rules">
      <header className="av-card-head is-compact">
        <div>
          <h2>Booking rules</h2>
          <p>Saved as soon as you change them.</p>
        </div>
      </header>

      <div className="av-rule">
        <span className="av-rule-label" id="av-length">
          Consultation length
        </span>
        <div className="av-chips" role="radiogroup" aria-labelledby="av-length">
          {withCurrent(LENGTH_OPTIONS, schedule.consultationMinutes).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={schedule.consultationMinutes === n}
              disabled={saving}
              onClick={() => schedule.consultationMinutes !== n && pickLength(n)}
            >
              {n < 60 ? n : `${n / 60}h`}
              {n < 60 && <small>m</small>}
            </button>
          ))}
        </div>
        {lengthError && <small className="av-rule-error">{lengthError}</small>}
      </div>

      <label className="av-rule">
        <span className="av-rule-label">Book ahead</span>
        <select
          className="av-select"
          value={schedule.windowDays}
          disabled={saving}
          onChange={(e) => onSave({ windowDays: Number(e.target.value) }, "Booking window saved.")}
        >
          {withCurrent(WINDOW_OPTIONS.filter((n) => n <= maxWindow), schedule.windowDays).map((n) => (
            <option key={n} value={n}>
              Up to {n} days
            </option>
          ))}
        </select>
        <small>Patients can book until {shortDate(addDays(today, schedule.windowDays))}.</small>
      </label>

      <label className="av-rule">
        <span className="av-rule-label">Minimum notice</span>
        <select
          className="av-select"
          value={schedule.noticeMinutes}
          disabled={saving}
          onChange={(e) => onSave({ noticeMinutes: Number(e.target.value) }, "Minimum notice saved.")}
        >
          {withCurrent(NOTICE_OPTIONS, schedule.noticeMinutes).map((n) => (
            <option key={n} value={n}>
              {formatNotice(n)}
            </option>
          ))}
        </select>
        <small>{schedule.noticeMinutes ? "No bookings starting sooner than this." : "Patients can book any time that hasn’t started."}</small>
      </label>

      <label className="av-rule">
        <span className="av-rule-label">Time zone</span>
        <select className="av-select" value={schedule.timezone} disabled={saving} onChange={(e) => onSave({ timezone: e.target.value }, "Time zone saved.")}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z)}
            </option>
          ))}
        </select>
        <small>Your hours are in this zone. Patients see their own.</small>
      </label>
    </section>
  );
};

/* ------------------------------------------------------------------------ */
/* Weekly hours as a list (keyboard and small screens)                      */
/* ------------------------------------------------------------------------ */

export const WeeklyDrawer: React.FC<{
  week: WeekMap;
  length: number;
  onClose: () => void;
  onApply: (week: WeekMap) => void;
}> = ({ week: initial, length, onClose, onApply }) => {
  const [week, setWeek] = useState<WeekMap>(() => Object.fromEntries(Object.entries(initial).map(([d, r]) => [d, cloneRanges(r)])));
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const invalid = WEEK_ORDER.some((d) => Object.keys(rangeErrors(week[d] ?? [], length)).length > 0);

  const setDay = (day: number, ranges: WeekMap[number]) =>
    setWeek((prev) => {
      const next = { ...prev };
      if (ranges.length) next[day] = ranges;
      else delete next[day];
      return next;
    });

  return (
    <Drawer
      wide
      title="Weekly hours"
      description="Your regular hours, repeated every week."
      onClose={onClose}
      footer={
        <>
          <button className="av-btn av-btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="av-btn av-btn-primary" type="button" disabled={invalid} onClick={() => onApply(week)}>
            Apply
          </button>
        </>
      }
    >
      <ul className="av-weekly">
        {WEEK_ORDER.map((day) => {
          const ranges = week[day] ?? [];
          const on = ranges.length > 0;
          return (
            <li className={on ? "is-on" : ""} key={day}>
              <div className="av-weekly-day">
                <Switch checked={on} label={`Available on ${DAYS[day]}`} onChange={() => setDay(day, on ? [] : [defaultRange()])} />
                <span>
                  <strong>{DAYS[day]}</strong>
                  {on && <small>{slotsInDay(ranges, length)} consultations</small>}
                </span>
              </div>
              {on ? (
                <HoursRows
                  ranges={ranges}
                  length={length}
                  label={DAYS[day]}
                  onChange={(next) => setDay(day, next)}
                  trailing={
                    <span className="av-menu-host">
                      <button
                        className="av-icon"
                        type="button"
                        aria-label={`Copy ${DAYS[day]}’s hours to other days`}
                        title="Copy to other days"
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
                            setWeek((prev) => {
                              const next = { ...prev };
                              for (const d of days) next[d] = cloneRanges(ranges);
                              return next;
                            });
                            setCopyFrom(null);
                          }}
                        />
                      )}
                    </span>
                  }
                />
              ) : (
                <span className="av-weekly-off">Unavailable</span>
              )}
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};
