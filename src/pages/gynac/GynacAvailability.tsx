import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarOff, Loader2, X } from "lucide-react";
import { getSchedule, saveSchedule } from "../../api/doctorApi";
import { ErrorState, PageHeader, PageSkeleton } from "../../components/ui";
import { useNoticeToast } from "../../components/Toast";
import { DateChanges } from "./availability/DateChanges";
import { DateEditor, TimeOffDialog } from "./availability/DateEditor";
import { BookingRules, Overview, WeeklyDrawer } from "./availability/Sidebar";
import { WeeklyHours } from "./availability/WeeklyHours";
import {
  DateChange,
  Schedule,
  WeekMap,
  fromApi,
  nowIn,
  sameWeek,
  scheduleProblem,
  selectionTitle,
  toApi,
  todayIn,
  weekdayOf
} from "./availability/model";

type Overlay = "list" | "timeoff" | null;

/**
 * Availability: weekly hours on a timeline (edited as a draft, saved
 * together), date-specific changes beside a month, and booking rules that
 * save as they change.
 */
export const GynacAvailability: React.FC = () => {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState<WeekMap | null>(null);
  const [maxWindow, setMaxWindow] = useState(90);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outsideHours, setOutsideHours] = useState<{ id: string; scheduledFor: string }[]>([]);
  const [editing, setEditing] = useState<string[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [now, setNow] = useState(0);
  useNoticeToast(notice, () => setNotice(null));

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getSchedule();
      setSchedule(fromApi(data));
      if (data.limits?.maxBookingWindowDays) setMaxWindow(data.limits.maxBookingWindowDays);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the "now" line and next open time current.
  const zone = schedule?.timezone;
  useEffect(() => {
    if (!zone) return;
    const tick = () => setNow(nowIn(zone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [zone]);

  const dirty = Boolean(schedule && draft && !sameWeek(draft, schedule.week));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Save the whole schedule with one change applied. */
  const commit = async (next: Schedule, message: string) => {
    const problem = scheduleProblem(next);
    if (problem) {
      setError(problem);
      return false;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await saveSchedule(toApi(next));
      setSchedule(fromApi(result));
      setOutsideHours(result.outsideHours ?? []);
      setNotice(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton stats={0} rows={6} />;
  if (!schedule) return <ErrorState message={error ?? "Failed to load availability."} onRetry={load} />;

  const today = todayIn(schedule.timezone);
  const week = draft ?? schedule.week;
  const draftProblem = dirty ? scheduleProblem({ ...schedule, week }) : null;

  // Settings and date changes save against the saved week, so a pending
  // weekly draft stays a draft.
  const saveDates = async (keys: string[], change: DateChange | null) => {
    const overrides = { ...schedule.overrides };
    for (const key of keys) {
      if (change) overrides[key] = { ranges: change.ranges.map((r) => ({ ...r })), note: change.note };
      else delete overrides[key];
    }
    const label = selectionTitle(keys);
    const ok = await commit(
      { ...schedule, overrides },
      change === null ? `${label} is back to your weekly hours.` : change.ranges.length ? `Custom hours saved for ${label}.` : `${label} marked as time off.`
    );
    if (ok) setEditing([]);
  };

  const saveWeek = async () => {
    if (await commit({ ...schedule, week }, "Weekly hours saved.")) setDraft(null);
  };

  return (
    <div className={`gx-page av-page${dirty ? " has-savebar" : ""}`}>
      <PageHeader
        eyebrow="Practice"
        title="Availability"
        subtitle="Set when patients can book you. Weekly hours repeat every week; date changes override them."
        actions={
          <button className="av-btn av-btn-primary" type="button" onClick={() => setOverlay("timeoff")}>
            <CalendarOff size={16} /> Add time off
          </button>
        }
      />

      {error && <ErrorState message={error} />}

      {outsideHours.length > 0 && (
        <div className="av-banner" role="status">
          <div>
            <strong>
              {outsideHours.length} booked consultation{outsideHours.length === 1 ? " falls" : "s fall"} outside your new hours
            </strong>
            <p>
              {outsideHours
                .slice(0, 4)
                .map((b) =>
                  new Intl.DateTimeFormat("en-IN", {
                    timeZone: schedule.timezone,
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit"
                  }).format(new Date(b.scheduledFor))
                )
                .join(" · ")}
              {outsideHours.length > 4 && ` · +${outsideHours.length - 4} more`}. They’re still booked. Reschedule or cancel them from{" "}
              <Link to="/bookings">Bookings</Link> if needed.
            </p>
          </div>
          <button className="av-icon" type="button" aria-label="Dismiss" onClick={() => setOutsideHours([])}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="av-layout">
        <div className="av-main">
          <WeeklyHours
            week={week}
            onChange={setDraft}
            length={schedule.consultationMinutes}
            todayDay={weekdayOf(today)}
            now={now}
            onEditAsList={() => setOverlay("list")}
          />
          <DateChanges
            schedule={schedule}
            today={today}
            saving={saving}
            onEdit={setEditing}
            onReset={(keys) => void saveDates(keys, null)}
            onTimeOff={() => setOverlay("timeoff")}
          />
        </div>

        <aside className="av-side">
          <Overview
            schedule={schedule}
            today={today}
            now={now}
            onSetup={() => {
              document.querySelector(".av-tl")?.scrollIntoView({ behavior: "smooth", block: "start" });
              // Land on the first template (or the first day's switch) for keyboard users.
              const target =
                document.querySelector<HTMLElement>(".av-preset") ?? document.querySelector<HTMLElement>(".av-tl input, .av-tl button");
              window.setTimeout(() => target?.focus({ preventScroll: true }), 300);
            }}
          />
          <BookingRules
            schedule={schedule}
            today={today}
            maxWindow={maxWindow}
            saving={saving}
            onSave={(patch, message) => void commit({ ...schedule, ...patch }, message)}
          />
        </aside>
      </div>

      {dirty && (
        <div className="av-savebar" role="region" aria-label="Unsaved weekly hours">
          <span className={draftProblem ? "is-error" : ""}>
            <i aria-hidden />
            {draftProblem ?? "You’ve changed your weekly hours"}
          </span>
          <button className="av-btn av-btn-on-dark" type="button" disabled={saving} onClick={() => setDraft(null)}>
            Discard
          </button>
          <button className="av-btn av-btn-primary" type="button" disabled={saving || Boolean(draftProblem)} onClick={saveWeek}>
            {saving && <Loader2 className="spin-icon" size={15} />} Save changes
          </button>
        </div>
      )}

      {editing.length > 0 && (
        <DateEditor
          key={editing.join()}
          schedule={schedule}
          keys={editing}
          today={today}
          saving={saving}
          onCancel={() => setEditing([])}
          onSave={saveDates}
        />
      )}
      {overlay === "list" && (
        <WeeklyDrawer
          week={week}
          length={schedule.consultationMinutes}
          onClose={() => setOverlay(null)}
          onApply={(next) => {
            setDraft(next);
            setOverlay(null);
          }}
        />
      )}
      {overlay === "timeoff" && (
        <TimeOffDialog
          today={today}
          saving={saving}
          onClose={() => setOverlay(null)}
          onSave={async (keys, note) => {
            const overrides = { ...schedule.overrides };
            for (const key of keys) overrides[key] = { ranges: [], note };
            if (await commit({ ...schedule, overrides }, `Time off added: ${selectionTitle(keys)}.`)) setOverlay(null);
          }}
        />
      )}
    </div>
  );
};
