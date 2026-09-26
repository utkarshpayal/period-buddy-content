import React from "react";
import {
  CalendarClock,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  Repeat,
  Send,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import type { PushSchedule, ScheduleRepeat, ScheduleStatus, ScheduleTiming } from "../../api/adminApi";

/*
 * Scheduling pieces for NotificationsPage: the "When" step of the composer
 * and the list of scheduled / repeating pushes.
 *
 * All times are IST, whatever the admin's own time zone: the backend reads
 * repeat rules ("daily at 09:00", "Mondays") in IST because the user base is
 * India-only, so the form does too. India has no DST, so +05:30 is exact.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_INTERVAL = 30;
const MAX_RUNS = 1000;

export type Ends = "never" | "on" | "after";

export type WhenState = {
  mode: "now" | "later";
  /** YYYY-MM-DD and HH:mm, IST. */
  date: string;
  time: string;
  repeat: ScheduleRepeat;
  interval: number;
  days: number[];
  ends: Ends;
  endDate: string;
  maxRuns: number;
};

const istParts = (iso: string | Date) => {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
};

export const todayIst = () => istParts(new Date()).date;

/** ISO instant for an IST wall-clock date + time. */
const istToIso = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const formatIst = (iso?: string | null) =>
  iso
    ? `${new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })} IST`
    : "—";

export const defaultWhen = (): WhenState => {
  // The next full hour, IST.
  const next = new Date(Math.ceil((Date.now() + 5 * 60 * 1000) / 3_600_000) * 3_600_000);
  const { date, time } = istParts(next);
  return {
    mode: "now",
    date,
    time,
    repeat: "none",
    interval: 1,
    days: [weekdayOf(date)],
    ends: "never",
    endDate: "",
    maxRuns: 10
  };
};

export const whenFromSchedule = (s: PushSchedule): WhenState => {
  const { date, time } = istParts(s.startAt);
  return {
    mode: "later",
    date,
    time,
    repeat: s.repeat,
    interval: s.interval || 1,
    days: s.daysOfWeek?.length ? s.daysOfWeek : [weekdayOf(date)],
    ends: s.maxRuns ? "after" : s.endAt ? "on" : "never",
    endDate: s.endAt ? istParts(s.endAt).date : "",
    maxRuns: s.maxRuns || 10
  };
};

export const toTiming = (w: WhenState): ScheduleTiming => {
  const timing: ScheduleTiming = { startAt: istToIso(w.date, w.time), repeat: w.repeat };
  if (w.repeat === "none") return timing;
  timing.interval = w.interval;
  if (w.repeat === "weekly") timing.daysOfWeek = [...w.days].sort((a, b) => a - b);
  timing.endAt = w.ends === "on" && w.endDate ? istToIso(w.endDate, "23:59") : null;
  timing.maxRuns = w.ends === "after" ? w.maxRuns : null;
  return timing;
};

/**
 * First reason the timing can't be saved, or null. `keepStartIso` is the
 * saved start of a schedule being edited: leaving it unchanged is fine even
 * though it's already in the past.
 */
export const whenBlocker = (w: WhenState, keepStartIso?: string): string | null => {
  if (w.mode === "now") return null;
  if (!w.date || !w.time) return "Pick a date and time";
  const start = istToIso(w.date, w.time);
  const unchanged = keepStartIso && new Date(keepStartIso).getTime() === new Date(start).getTime();
  if (!unchanged && new Date(start).getTime() < Date.now() - 60 * 1000) return "The send time is in the past";
  if (w.repeat === "none") return null;
  if (!Number.isInteger(w.interval) || w.interval < 1 || w.interval > MAX_INTERVAL)
    return `Repeat every 1–${MAX_INTERVAL}`;
  if (w.repeat === "weekly" && w.days.length === 0) return "Pick at least one weekday";
  if (w.ends === "on") {
    if (!w.endDate) return "Pick an end date";
    if (w.endDate < w.date) return "The end date is before the first send";
  }
  if (w.ends === "after" && (!Number.isInteger(w.maxRuns) || w.maxRuns < 1 || w.maxRuns > MAX_RUNS))
    return `Number of sends must be 1–${MAX_RUNS}`;
  return null;
};

const unit = (repeat: ScheduleRepeat, n: number) => {
  const base = repeat === "daily" ? "day" : repeat === "weekly" ? "week" : "month";
  return n === 1 ? base : `${base}s`;
};

/** Same wording as the backend's describeSchedule, for the live form. */
export const describeWhen = (w: WhenState) => {
  if (w.mode === "now") return "Right away";
  const at = `${w.time} IST`;
  const n = w.interval;
  let text: string;
  switch (w.repeat) {
    case "daily":
      text = `${n === 1 ? "Daily" : `Every ${n} days`} at ${at}`;
      break;
    case "weekly": {
      const days = [...w.days].sort((a, b) => a - b).map((d) => WEEKDAYS[d]).join(", ");
      text = `${n === 1 ? "Weekly" : `Every ${n} weeks`} on ${days || "—"} at ${at}`;
      break;
    }
    case "monthly":
      text = `${n === 1 ? "Monthly" : `Every ${n} months`} on day ${Number(w.date.slice(8, 10))} at ${at}`;
      break;
    default:
      return `Once on ${formatIst(istToIso(w.date, w.time))}`;
  }
  if (w.ends === "on" && w.endDate) text += `, until ${w.endDate}`;
  if (w.ends === "after") text += `, ${w.maxRuns} ${w.maxRuns === 1 ? "time" : "times"}`;
  return `${text} · first on ${w.date}`;
};

/* ------------------------------ When step ------------------------------ */

export const WhenStep: React.FC<{
  value: WhenState;
  onChange: (w: WhenState) => void;
  /** Editing a saved schedule: "send now" isn't an option. */
  lockLater?: boolean;
}> = ({ value: w, onChange, lockLater }) => {
  const set = (patch: Partial<WhenState>) => onChange({ ...w, ...patch });
  const setDate = (date: string) => {
    // Keep the weekday list in step with the start date while it's still
    // the single default day.
    const days = w.days.length <= 1 && date ? [weekdayOf(date)] : w.days;
    set({ date, days });
  };
  const toggleDay = (d: number) =>
    set({ days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] });

  return (
    <>
      {!lockLater && (
        <div className="pn-modes pn-modes-2" role="radiogroup" aria-label="When to send">
          <button
            type="button"
            role="radio"
            aria-checked={w.mode === "now"}
            className={`pn-mode ${w.mode === "now" ? "is-active" : ""}`}
            onClick={() => set({ mode: "now" })}
          >
            <span className="pn-mode-icon">
              <Send size={18} />
            </span>
            <span className="pn-mode-label">Send now</span>
            <span className="pn-mode-hint">Starts delivering right away</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={w.mode === "later"}
            className={`pn-mode ${w.mode === "later" ? "is-active" : ""}`}
            onClick={() => set({ mode: "later" })}
          >
            <span className="pn-mode-icon">
              <CalendarClock size={18} />
            </span>
            <span className="pn-mode-label">Schedule</span>
            <span className="pn-mode-hint">Later, or on repeat</span>
          </button>
        </div>
      )}

      {w.mode === "later" && (
        <div className="pn-when">
          <div className="pn-when-row">
            <label className="pn-field">
              <span className="pn-label-row">
                <span>{w.repeat === "none" ? "Date" : "First send"}</span>
              </span>
              <input type="date" value={w.date} min={todayIst()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="pn-field">
              <span className="pn-label-row">
                <span>Time (IST)</span>
              </span>
              <input type="time" value={w.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
            <label className="pn-field">
              <span className="pn-label-row">
                <span>Repeat</span>
              </span>
              <select value={w.repeat} onChange={(e) => set({ repeat: e.target.value as ScheduleRepeat })}>
                <option value="none">Doesn't repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          {w.repeat !== "none" && (
            <>
              <div className="pn-when-inline">
                <span>Every</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_INTERVAL}
                  value={w.interval}
                  aria-label="Repeat interval"
                  onChange={(e) => set({ interval: Math.floor(Number(e.target.value)) || 0 })}
                />
                <span>{unit(w.repeat, w.interval)}</span>
                {w.repeat === "monthly" && Number(w.date.slice(8, 10)) > 28 && (
                  <small className="pn-muted">— shorter months use their last day</small>
                )}
              </div>

              {w.repeat === "weekly" && (
                <div className="pn-days" role="group" aria-label="Weekdays">
                  {WEEKDAYS.map((label, d) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={w.days.includes(d)}
                      className={`admin-chip ${w.days.includes(d) ? "is-active" : ""}`}
                      onClick={() => toggleDay(d)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="pn-when-inline">
                <span>Ends</span>
                <select value={w.ends} onChange={(e) => set({ ends: e.target.value as Ends })} aria-label="Ends">
                  <option value="never">Never</option>
                  <option value="on">On a date</option>
                  <option value="after">After a number of sends</option>
                </select>
                {w.ends === "on" && (
                  <input
                    type="date"
                    value={w.endDate}
                    min={w.date || todayIst()}
                    aria-label="End date"
                    onChange={(e) => set({ endDate: e.target.value })}
                  />
                )}
                {w.ends === "after" && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={MAX_RUNS}
                      value={w.maxRuns}
                      aria-label="Number of sends"
                      onChange={(e) => set({ maxRuns: Math.floor(Number(e.target.value)) || 0 })}
                    />
                    <span>sends</span>
                  </>
                )}
              </div>
            </>
          )}

          <div className="pn-reach">
            {w.repeat === "none" ? <CalendarClock size={14} /> : <Repeat size={14} />}
            <span>{describeWhen(w)}</span>
          </div>
          <small className="pn-muted">
            Recipients are counted again at each send, so new sign-ups are included. A send more than an
            hour late (for example, during server downtime) is skipped rather than sent late.
          </small>
        </div>
      )}
    </>
  );
};

/* --------------------------- Scheduled list --------------------------- */

const SCHEDULE_PILL: Record<ScheduleStatus, string> = {
  active: "gy-pill-ok",
  paused: "gy-pill-warn",
  completed: "gy-pill-muted",
  cancelled: "gy-pill-muted"
};

const SCHEDULE_LABEL: Record<ScheduleStatus, string> = {
  active: "Scheduled",
  paused: "Paused",
  completed: "Finished",
  cancelled: "Cancelled"
};

export const ScheduledList: React.FC<{
  schedules: PushSchedule[];
  loading: boolean;
  busyId: string | null;
  audienceText: (s: PushSchedule) => string;
  onEdit: (s: PushSchedule) => void;
  onReuse: (s: PushSchedule) => void;
  onPause: (s: PushSchedule) => void;
  onResume: (s: PushSchedule) => void;
  onCancel: (s: PushSchedule) => void;
}> = ({ schedules, loading, busyId, audienceText, onEdit, onReuse, onPause, onResume, onCancel }) => {
  if (loading) {
    return (
      <div className="gy-empty">
        <Loader2 className="spin-icon" size={22} />
        <p>Loading scheduled pushes…</p>
      </div>
    );
  }
  if (schedules.length === 0) {
    return (
      <div className="gy-empty pn-empty">
        <CalendarClock size={28} />
        <p>Nothing scheduled. Choose “Schedule” when composing to send later or on repeat.</p>
      </div>
    );
  }
  return (
    <div className="pn-history">
      {schedules.map((s) => {
        const open = s.status === "active" || s.status === "paused";
        const busy = busyId === s._id;
        return (
          <article key={s._id} className="pn-item">
            <div className="pn-item-top">
              <span className={`gy-pill ${SCHEDULE_PILL[s.status]}`}>{SCHEDULE_LABEL[s.status]}</span>
              <span className="pn-item-aud">
                {s.repeat === "none" ? <CalendarClock size={13} /> : <Repeat size={13} />}
                {s.description}
              </span>
              <span className="pn-item-aud">
                {s.audience === "selected" ? <UserPlus size={13} /> : <Users size={13} />}
                {audienceText(s)}
              </span>
            </div>

            <div className="pn-item-title">{s.title}</div>
            <div className="pn-item-body">{s.body}</div>

            <div className="pn-stats">
              {s.status === "active" && (
                <span>
                  Next: <strong>{formatIst(s.nextRunAt)}</strong>
                </span>
              )}
              <span>
                <strong>{s.runCount}</strong>
                {s.maxRuns ? ` of ${s.maxRuns}` : ""} sent
              </span>
              {s.lastRunAt && <span>Last: {formatIst(s.lastRunAt)}</span>}
              {s.skippedCount > 0 && (
                <span title="Occurrences skipped because the server was offline past them">
                  <strong>{s.skippedCount}</strong> skipped
                </span>
              )}
              {s.endAt && <span>Ends {formatIst(s.endAt)}</span>}
            </div>

            {s.lastError && <div className="pn-item-error">{s.lastError}</div>}

            <div className="pn-item-actions">
              {open && (
                <button type="button" className="gy-link" disabled={busy} onClick={() => onEdit(s)}>
                  <Pencil size={13} /> Edit
                </button>
              )}
              {s.status === "active" && (
                <button type="button" className="gy-link" disabled={busy} onClick={() => onPause(s)}>
                  <Pause size={13} /> Pause
                </button>
              )}
              {s.status === "paused" && (
                <button type="button" className="gy-link" disabled={busy} onClick={() => onResume(s)}>
                  <Play size={13} /> Resume
                </button>
              )}
              <button type="button" className="gy-link" onClick={() => onReuse(s)}>
                <Copy size={13} /> Reuse message
              </button>
              {open && (
                <button type="button" className="gy-link pn-danger" disabled={busy} onClick={() => onCancel(s)}>
                  <XCircle size={13} /> Cancel
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
