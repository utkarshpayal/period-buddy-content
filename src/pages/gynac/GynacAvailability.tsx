import React, { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, Plus, Trash2, Clock, Copy, CalendarOff } from "lucide-react";
import { AvailabilitySlot, getAvailability, setAvailability } from "../../api/doctorApi";
import { ErrorState, PageHeader, PageSkeleton, Toggle } from "../../components/ui";
import { useNoticeToast } from "../../components/Toast";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Range = { startTime: string; endTime: string; maxSlots: number };
type WeekMap = Record<number, Range[]>;

const defaultRange = (): Range => ({ startTime: "09:00", endTime: "12:00", maxSlots: 4 });

export const GynacAvailability: React.FC = () => {
  const [week, setWeek] = useState<WeekMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));

  useEffect(() => {
    (async () => {
      try {
        const slots = await getAvailability();
        const map: WeekMap = {};
        for (const s of slots) {
          (map[s.dayOfWeek] ||= []).push({
            startTime: s.startTime,
            endTime: s.endTime,
            maxSlots: s.maxSlots ?? 4
          });
        }
        setWeek(map);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load availability.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enabledDays = useMemo(
    () => Object.keys(week).filter((d) => (week[Number(d)]?.length ?? 0) > 0).length,
    [week]
  );

  const weeklySlots = useMemo(
    () =>
      Object.values(week)
        .flat()
        .reduce((sum, r) => sum + (Number(r.maxSlots) || 0), 0),
    [week]
  );

  const toggleDay = (day: number) => {
    setDirty(true);
    setWeek((prev) => {
      const next = { ...prev };
      if (next[day]?.length) delete next[day];
      else next[day] = [defaultRange()];
      return next;
    });
  };

  const addRange = (day: number) => {
    setDirty(true);
    setWeek((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), defaultRange()] }));
  };

  const removeRange = (day: number, idx: number) => {
    setDirty(true);
    setWeek((prev) => {
      const ranges = (prev[day] ?? []).filter((_, i) => i !== idx);
      const next = { ...prev };
      if (ranges.length) next[day] = ranges;
      else delete next[day];
      return next;
    });
  };

  const updateRange = (day: number, idx: number, patch: Partial<Range>) => {
    setDirty(true);
    setWeek((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((r, i) => (i === idx ? { ...r, ...patch } : r))
    }));
  };

  const copyToWeekdays = (day: number) => {
    const ranges = week[day];
    if (!ranges?.length) return;
    setDirty(true);
    setWeek((prev) => {
      const next = { ...prev };
      [1, 2, 3, 4, 5].forEach((d) => {
        next[d] = ranges.map((r) => ({ ...r }));
      });
      return next;
    });
    setNotice("Copied to all weekdays (Mon–Fri). Remember to save.");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    // Flatten the week map back into the API's slot array.
    const slots: AvailabilitySlot[] = [];
    for (const [day, ranges] of Object.entries(week)) {
      for (const r of ranges) {
        if (r.startTime >= r.endTime) {
          setSaving(false);
          setError(`${DAYS[Number(day)]}: start time must be before end time.`);
          return;
        }
        slots.push({
          dayOfWeek: Number(day),
          startTime: r.startTime,
          endTime: r.endTime,
          maxSlots: r.maxSlots,
          isAvailable: true
        });
      }
    }
    try {
      await setAvailability(slots);
      setNotice("Availability saved.");
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  };

  const minutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Overview strip spans 6am–10pm so typical clinic hours fill the bar.
  const DAY_START = 6 * 60;
  const DAY_SPAN = 16 * 60;

  if (loading) return <PageSkeleton stats={0} rows={7} />;

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Practice"
        title="Weekly availability"
        subtitle={`Recurring hours patients can book. ${enabledDays} day${enabledDays === 1 ? "" : "s"} open · ${weeklySlots} slot${weeklySlots === 1 ? "" : "s"} a week.`}
        actions={
          <button className="gx-btn gx-btn-primary" type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        }
      />

      {error && <ErrorState message={error} />}

      <section className="gx-card gx-week-overview" aria-label="Week at a glance">
        {DAYS_SHORT.map((label, day) => (
          <div className="gx-week-col" key={label}>
            <span className="gx-week-day">{label}</span>
            <div className="gx-week-track">
              {(week[day] ?? []).map((r, i) => {
                const top = Math.max(0, ((minutes(r.startTime) - DAY_START) / DAY_SPAN) * 100);
                const height = Math.max(3, ((minutes(r.endTime) - minutes(r.startTime)) / DAY_SPAN) * 100);
                return (
                  <span
                    key={i}
                    className="gx-week-block"
                    style={{ top: `${top}%`, height: `${Math.min(height, 100 - top)}%` }}
                    title={`${r.startTime}–${r.endTime} · ${r.maxSlots} slots`}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="gx-week-scale" aria-hidden>
          <span>6am</span>
          <span>2pm</span>
          <span>10pm</span>
        </div>
      </section>

      <div className="gx-days">
        {DAYS.map((label, day) => {
          const ranges = week[day] ?? [];
          const active = ranges.length > 0;
          return (
            <section className={`gx-day ${active ? "is-open" : ""}`} key={label}>
              <div className="gx-day-head">
                <Toggle checked={active} onChange={() => toggleDay(day)} label={<strong>{label}</strong>} />
                {active ? (
                  <div className="gx-day-tools">
                    <button className="gx-btn gx-btn-ghost gx-btn-sm" type="button" onClick={() => addRange(day)}>
                      <Plus size={14} /> Add hours
                    </button>
                    {day !== 0 && day !== 6 && (
                      <button className="gx-btn gx-btn-ghost gx-btn-sm" type="button" onClick={() => copyToWeekdays(day)}>
                        <Copy size={14} /> Copy to weekdays
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="gx-day-off">
                    <CalendarOff size={14} /> Unavailable
                  </span>
                )}
              </div>

              {active && (
                <div className="gx-ranges">
                  {ranges.map((r, idx) => {
                    const invalid = r.startTime >= r.endTime;
                    return (
                      <div className={`gx-range ${invalid ? "is-invalid" : ""}`} key={idx}>
                        <label>
                          <span>From</span>
                          <input type="time" value={r.startTime} onChange={(e) => updateRange(day, idx, { startTime: e.target.value })} />
                        </label>
                        <label>
                          <span>To</span>
                          <input type="time" value={r.endTime} onChange={(e) => updateRange(day, idx, { endTime: e.target.value })} />
                        </label>
                        <label className="gx-range-slots">
                          <span>Slots</span>
                          <input
                            type="number"
                            min={1}
                            value={r.maxSlots}
                            onChange={(e) => updateRange(day, idx, { maxSlots: Number(e.target.value) })}
                          />
                        </label>
                        <button className="gx-icon-btn is-danger" type="button" onClick={() => removeRange(day, idx)} aria-label={`Remove ${label} hours`}>
                          <Trash2 size={16} />
                        </button>
                        {invalid && <p className="gx-field-error">End time must be after the start time.</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="gx-hint">
        <Clock size={14} /> Patients see these hours in the app when they book a consultation.
      </p>
    </div>
  );
};
