import React, { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Plus, Trash2, Clock, Copy } from "lucide-react";
import { AvailabilitySlot, getAvailability, setAvailability } from "../../api/doctorApi";
import { GynacHead } from "./GynacHead";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Range = { startTime: string; endTime: string; maxSlots: number };
type WeekMap = Record<number, Range[]>;

const defaultRange = (): Range => ({ startTime: "09:00", endTime: "12:00", maxSlots: 4 });

export const GynacAvailability: React.FC = () => {
  const [week, setWeek] = useState<WeekMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const toggleDay = (day: number) => {
    setWeek((prev) => {
      const next = { ...prev };
      if (next[day]?.length) delete next[day];
      else next[day] = [defaultRange()];
      return next;
    });
  };

  const addRange = (day: number) =>
    setWeek((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), defaultRange()] }));

  const removeRange = (day: number, idx: number) =>
    setWeek((prev) => {
      const ranges = (prev[day] ?? []).filter((_, i) => i !== idx);
      const next = { ...prev };
      if (ranges.length) next[day] = ranges;
      else delete next[day];
      return next;
    });

  const updateRange = (day: number, idx: number, patch: Partial<Range>) =>
    setWeek((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((r, i) => (i === idx ? { ...r, ...patch } : r))
    }));

  const copyToWeekdays = (day: number) => {
    const ranges = week[day];
    if (!ranges?.length) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace-page">
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading availability…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <GynacHead
        title="Weekly Availability"
        subtitle={`Set the recurring hours when patients can book you. ${enabledDays} day${
          enabledDays === 1 ? "" : "s"
        } active.`}
        actions={
          <button className="gy-btn gy-btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
            Save availability
          </button>
        }
      />

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="gy-alert gy-alert-ok">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      <div className="gy-week">
        {DAYS.map((label, day) => {
          const ranges = week[day] ?? [];
          const active = ranges.length > 0;
          return (
            <section className={`gy-card gy-day-card ${active ? "active" : ""}`} key={label}>
              <div className="gy-day-head">
                <label className="gy-switch">
                  <input type="checkbox" checked={active} onChange={() => toggleDay(day)} />
                  <span className="gy-switch-track" aria-hidden />
                  <span className="gy-day-name">
                    <span className="gy-day-full">{label}</span>
                    <span className="gy-day-short">{DAYS_SHORT[day]}</span>
                  </span>
                </label>
                {active && (
                  <div className="gy-day-tools">
                    <button className="gy-btn gy-btn-ghost" type="button" onClick={() => addRange(day)}>
                      <Plus size={14} /> Range
                    </button>
                    {day !== 0 && day !== 6 && (
                      <button className="gy-btn gy-btn-ghost" type="button" onClick={() => copyToWeekdays(day)}>
                        <Copy size={14} /> To weekdays
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!active ? (
                <p className="gy-muted gy-day-off">Unavailable</p>
              ) : (
                <div className="gy-range-list">
                  {ranges.map((r, idx) => (
                    <div className="gy-range-row" key={idx}>
                      <input
                        type="time"
                        value={r.startTime}
                        onChange={(e) => updateRange(day, idx, { startTime: e.target.value })}
                      />
                      <span className="gy-muted">to</span>
                      <input
                        type="time"
                        value={r.endTime}
                        onChange={(e) => updateRange(day, idx, { endTime: e.target.value })}
                      />
                      <label className="gy-slot-max">
                        <span>Slots</span>
                        <input
                          type="number"
                          min={1}
                          value={r.maxSlots}
                          onChange={(e) => updateRange(day, idx, { maxSlots: Number(e.target.value) })}
                        />
                      </label>
                      <button
                        className="gy-icon-btn gy-icon-danger"
                        type="button"
                        onClick={() => removeRange(day, idx)}
                        aria-label="Remove range"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="gy-avail-hint">
        <Clock size={14} />
        <span>Patients see these hours in the app when booking a consultation.</span>
      </div>
    </div>
  );
};
