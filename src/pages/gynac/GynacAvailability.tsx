import React, { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, Plus, Trash2, Clock, Copy, CalendarOff, Globe2 } from "lucide-react";
import { AvailabilitySlot, browserTimeZone, getAvailability, setAvailability } from "../../api/doctorApi";
import { ErrorState, PageHeader, PageSkeleton, Toggle } from "../../components/ui";
import { useNoticeToast } from "../../components/Toast";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `maxSlots` is kept as typed text while editing; parsed with slotCount. */
type Range = { startTime: string; endTime: string; maxSlots: string };
type WeekMap = Record<number, Range[]>;

const defaultRange = (): Range => ({ startTime: "09:00", endTime: "12:00", maxSlots: "4" });

// Backend rules: 1–24 equal slots per range, each at least 10 minutes.
const MIN_SLOTS = 1;
const MAX_SLOTS = 24;
const MIN_SLOT_MINUTES = 10;

const COMMON_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney"
];

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Whole number of slots, or null when the text isn't a valid 1–24 integer. */
const slotCount = (text: string): number | null => {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= MIN_SLOTS && n <= MAX_SLOTS ? n : null;
};

const clampSlots = (text: string) => {
  const n = Math.round(Number(text));
  if (!Number.isFinite(n) || n < MIN_SLOTS) return String(MIN_SLOTS);
  return String(Math.min(MAX_SLOTS, n));
};

/** "45 min" / "1 h 30 min" / "22.5 min". */
const formatLength = (mins: number) => {
  const rounded = Math.round(mins * 10) / 10;
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = Math.round((rounded - h * 60) * 10) / 10;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** "Asia/Kolkata (IST, GMT+5:30)" */
const zoneLabel = (zone: string) => {
  try {
    const parts = (style: "short" | "shortOffset") =>
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: style })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value;
    const short = parts("short");
    let offset: string | undefined;
    try {
      offset = parts("shortOffset");
    } catch {
      offset = undefined;
    }
    const extra = [short, offset && offset !== short ? offset : undefined].filter(Boolean).join(", ");
    return extra ? `${zone.replace(/_/g, " ")} (${extra})` : zone.replace(/_/g, " ");
  } catch {
    return zone;
  }
};

const isValidZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Problems with one day's ranges, by index (start/end order, slot count, slot length, overlaps). */
function rangeErrors(ranges: Range[]): Record<number, string> {
  const errors: Record<number, string> = {};
  ranges.forEach((r, i) => {
    const span = minutes(r.endTime) - minutes(r.startTime);
    const count = slotCount(r.maxSlots);
    if (!r.startTime || !r.endTime || span <= 0) errors[i] = "End time must be after the start time.";
    else if (count == null) errors[i] = `Slots must be a whole number from ${MIN_SLOTS} to ${MAX_SLOTS}.`;
    else if (span / count < MIN_SLOT_MINUTES) errors[i] = `Each slot must be at least ${MIN_SLOT_MINUTES} minutes — use fewer slots or longer hours.`;
  });
  const order = ranges.map((r, i) => ({ i, start: minutes(r.startTime), end: minutes(r.endTime) })).sort((a, b) => a.start - b.start);
  for (let k = 1; k < order.length; k++) {
    if (order[k].start < order[k - 1].end) {
      errors[order[k].i] ??= "These hours overlap another range on this day.";
      errors[order[k - 1].i] ??= "These hours overlap another range on this day.";
    }
  }
  return errors;
}

export const GynacAvailability: React.FC = () => {
  const [week, setWeek] = useState<WeekMap>({});
  const [timezone, setTimezone] = useState<string>(() => browserTimeZone());
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
            maxSlots: clampSlots(String(s.maxSlots ?? 4))
          });
        }
        setWeek(map);
        // The zone the hours were saved in wins over the browser's.
        const stored = slots.find((s) => s.timezone && isValidZone(s.timezone))?.timezone;
        if (stored) setTimezone(stored);
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
        .reduce((sum, r) => sum + (slotCount(r.maxSlots) ?? 0), 0),
    [week]
  );

  const errorsByDay = useMemo(() => {
    const out: Record<number, Record<number, string>> = {};
    for (const [day, ranges] of Object.entries(week)) out[Number(day)] = rangeErrors(ranges);
    return out;
  }, [week]);
  const hasErrors = Object.values(errorsByDay).some((e) => Object.keys(e).length > 0);

  const zoneOptions = useMemo(() => {
    const list = [...COMMON_ZONES];
    for (const z of [browserTimeZone(), timezone]) if (z && !list.includes(z)) list.unshift(z);
    return list;
  }, [timezone]);

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
    setWeek((prev) => {
      const existing = prev[day] ?? [];
      // Start the new range where the latest one ends, so it doesn't overlap.
      const lastEnd = Math.max(0, ...existing.map((r) => minutes(r.endTime)));
      const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const next: Range =
        existing.length && lastEnd + 60 <= 23 * 60 + 59
          ? { startTime: toTime(lastEnd), endTime: toTime(Math.min(lastEnd + 180, 23 * 60 + 59)), maxSlots: "4" }
          : defaultRange();
      return { ...prev, [day]: [...existing, next] };
    });
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
    setError(null);
    setNotice(null);
    // Flatten the week map back into the API's slot array (one zone for all).
    const slots: AvailabilitySlot[] = [];
    for (const [day, ranges] of Object.entries(week)) {
      const errs = rangeErrors(ranges);
      const first = Object.values(errs)[0];
      if (first) {
        setError(`${DAYS[Number(day)]}: ${first}`);
        return;
      }
      for (const r of ranges) {
        slots.push({
          dayOfWeek: Number(day),
          startTime: r.startTime,
          endTime: r.endTime,
          maxSlots: slotCount(r.maxSlots) ?? MIN_SLOTS,
          timezone,
          isAvailable: true
        });
      }
    }
    setSaving(true);
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
          <button className="gx-btn gx-btn-primary" type="button" onClick={save} disabled={saving || !dirty || hasErrors}>
            {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        }
      />

      {error && <ErrorState message={error} />}

      <section className="gx-card gx-zone-bar" aria-label="Time zone">
        <label className="gx-field">
          <span>
            <Globe2 size={14} /> Time zone
          </span>
          <select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setDirty(true);
            }}
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {zoneLabel(z)}
              </option>
            ))}
          </select>
        </label>
        <p className="gx-muted">
          Times are in <strong>{zoneLabel(timezone)}</strong>. Patients see each slot converted to their own time.
        </p>
      </section>

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
                    title={`${r.startTime}–${r.endTime} · ${slotCount(r.maxSlots) ?? "?"} slots`}
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
                    const problem = errorsByDay[day]?.[idx];
                    const invalid = Boolean(problem);
                    const count = slotCount(r.maxSlots);
                    const span = minutes(r.endTime) - minutes(r.startTime);
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
                            min={MIN_SLOTS}
                            max={MAX_SLOTS}
                            step={1}
                            inputMode="numeric"
                            value={r.maxSlots}
                            onChange={(e) => updateRange(day, idx, { maxSlots: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })}
                            onBlur={() => {
                              const clamped = clampSlots(r.maxSlots);
                              if (clamped !== r.maxSlots) updateRange(day, idx, { maxSlots: clamped });
                            }}
                          />
                        </label>
                        <button className="gx-icon-btn is-danger" type="button" onClick={() => removeRange(day, idx)} aria-label={`Remove ${label} hours`}>
                          <Trash2 size={16} />
                        </button>
                        {problem ? (
                          <p className="gx-field-error">{problem}</p>
                        ) : count && span > 0 ? (
                          <p className="gx-range-summary">
                            {count} slot{count === 1 ? "" : "s"} · {formatLength(span / count)} each
                          </p>
                        ) : null}
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
        <Clock size={14} /> Each range is split into equal slots, one patient per slot. Patients see these hours in the app when they book a consultation.
      </p>
    </div>
  );
};
