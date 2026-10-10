import { DoctorSchedule, browserTimeZone } from "../../../api/doctorApi";

/*
 * Availability page model: the schedule as the page edits it, and the pure
 * helpers around it. Dates are "YYYY-MM-DD" keys in the doctor's zone; date
 * math runs on UTC midnights so the viewer's own zone never shifts a day.
 */

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weeks start on Monday everywhere on this page. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type Range = { startTime: string; endTime: string };
export type WeekMap = Record<number, Range[]>;
/** One date's own hours. No ranges = unavailable that day. */
export type DateChange = { ranges: Range[]; note: string };
export type OverrideMap = Record<string, DateChange>;

export type Schedule = {
  week: WeekMap;
  overrides: OverrideMap;
  timezone: string;
  consultationMinutes: number;
  windowDays: number;
  noticeMinutes: number;
};

export const MAX_RANGES_PER_DAY = 12;
export const CALENDAR_MONTHS_AHEAD = 12;
export const MAX_TIME_OFF_DAYS = 180;

export const LENGTH_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
export const WINDOW_OPTIONS = [7, 14, 21, 30, 45, 60, 90];
export const NOTICE_OPTIONS = [0, 15, 30, 60, 120, 240, 720, 1440, 2880];
export const COMMON_ZONES = [
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

/* ----------------------------- Times ----------------------------------- */

export const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "09:30" → "9:30 AM". */
export const formatClock = (t: string) => {
  const total = minutes(t);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const formatRange = (r: Range) => `${formatClock(r.startTime)} – ${formatClock(r.endTime)}`;

/** "09:00"–"10:00" → "9–10 AM"; "11:30"–"14:00" → "11:30 AM–2 PM". For dense read-only views. */
export const formatCompact = (r: Range) => {
  const part = (t: string) => {
    const total = minutes(t);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return { text: `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`, half: h < 12 ? "AM" : "PM" };
  };
  const a = part(r.startTime);
  const b = part(r.endTime);
  return a.half === b.half ? `${a.text}–${b.text} ${b.half}` : `${a.text} ${a.half}–${b.text} ${b.half}`;
};

/** Back-to-back or overlapping ranges joined into one, for display only. */
export const mergeRanges = (ranges: Range[]) =>
  sortRanges(ranges).reduce<Range[]>((out, r) => {
    const last = out[out.length - 1];
    if (last && minutes(r.startTime) <= minutes(last.endTime)) {
      if (minutes(r.endTime) > minutes(last.endTime)) last.endTime = r.endTime;
    } else out.push({ ...r });
    return out;
  }, []);

/** The hour window a day bar shows: working hours with a margin. */
export const viewBounds = (week: WeekMap): [number, number] => {
  const all = Object.values(week).flat();
  const start = Math.min(7 * 60, ...all.map((r) => minutes(r.startTime)));
  const end = Math.max(21 * 60, ...all.map((r) => minutes(r.endTime)));
  return [Math.floor(start / 60) * 60, Math.min(24 * 60, Math.ceil(end / 60) * 60)];
};

export const formatDuration = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const formatNotice = (mins: number) => {
  if (mins === 0) return "No minimum";
  if (mins < 60) return `${mins} minutes`;
  if (mins < 1440) return `${mins / 60} hour${mins === 60 ? "" : "s"}`;
  return `${mins / 1440} day${mins === 1440 ? "" : "s"}`;
};

export const sortRanges = (ranges: Range[]) => [...ranges].sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
export const cloneRanges = (ranges: Range[]) => ranges.map((r) => ({ ...r }));

/** Consultations that fit in a range at `length` minutes each. */
export const slotsIn = (r: Range, length: number) => Math.max(0, Math.floor((minutes(r.endTime) - minutes(r.startTime)) / length));
export const slotsInDay = (ranges: Range[], length: number) => ranges.reduce((sum, r) => sum + slotsIn(r, length), 0);

export const defaultRange = (): Range => ({ startTime: "09:00", endTime: "13:00" });

/**
 * A new range that doesn't overlap: three hours starting an hour after the
 * day's latest one, else an hour in the first free gap from 8 AM.
 */
export const nextRange = (existing: Range[]): Range => {
  if (!existing.length) return defaultRange();
  const end = 23 * 60 + 45;
  const lastEnd = Math.max(...existing.map((r) => minutes(r.endTime)));
  if (lastEnd + 120 <= end) {
    const start = Math.ceil((lastEnd + 60) / 15) * 15;
    return { startTime: toTime(start), endTime: toTime(Math.min(start + 180, end)) };
  }
  const taken = existing.map((r) => [minutes(r.startTime), minutes(r.endTime)]);
  // Prefer a gap with an hour either side, so the new hours stay separate.
  for (const buffer of [60, 0]) {
    const order = [...Array(96).keys()].map((q) => (32 + q) % 96 * 15); // from 8 AM, wrapping
    const start = order.find((t) => t + 60 <= end && taken.every(([s, e]) => t + 60 + buffer <= s || t >= e + buffer));
    if (start !== undefined) return { startTime: toTime(start), endTime: toTime(start + 60) };
  }
  return defaultRange();
};

/** Problems with one day's ranges, by index. */
export function rangeErrors(ranges: Range[], length: number): Record<number, string> {
  const errors: Record<number, string> = {};
  ranges.forEach((r, i) => {
    const span = minutes(r.endTime) - minutes(r.startTime);
    if (span <= 0) errors[i] = "End time must be after the start time.";
    else if (span < length) errors[i] = `Too short for a ${length}-minute consultation.`;
  });
  const order = ranges.map((r, i) => ({ i, start: minutes(r.startTime), end: minutes(r.endTime) })).sort((a, b) => a.start - b.start);
  for (let k = 1; k < order.length; k++) {
    if (order[k].start < order[k - 1].end) {
      errors[order[k].i] ??= "Overlaps other hours on this day.";
      errors[order[k - 1].i] ??= "Overlaps other hours on this day.";
    }
  }
  return errors;
}

export const firstError = (ranges: Range[], length: number) => Object.values(rangeErrors(ranges, length))[0] ?? null;

/* ----------------------------- Dates ----------------------------------- */

export const keyToDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const dateToKey = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => dateToKey(new Date(keyToDate(key).getTime() + n * 86400000));
export const weekdayOf = (key: string) => keyToDate(key).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86400000);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
export const isContiguous = (keys: string[]) => keys.every((k, i) => i === 0 || daysBetween(keys[i - 1], k) === 1);
export const spanKeys = (from: string, to: string) => Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));

/** Today's date in `zone`. */
export const todayIn = (zone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return dateToKey(new Date());
  }
};

export const formatKey = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...options }).format(keyToDate(key));

/** "Thu, 15 Oct" */
export const shortDate = (key: string) => formatKey(key, { weekday: "short", day: "numeric", month: "short" });
/** "Thursday, 15 October" */
export const fullDate = (key: string) => formatKey(key, { weekday: "long", day: "numeric", month: "long" });

/** "15 – 17 Oct", "30 Oct – 2 Nov", or one date. */
export const formatSpan = (from: string, to: string) => {
  if (from === to) return shortDate(from);
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${formatKey(from, { day: "numeric" })} – ${formatKey(to, { day: "numeric", month: "short" })}`
    : `${formatKey(from, { day: "numeric", month: "short" })} – ${formatKey(to, { day: "numeric", month: "short" })}`;
};

/** What a selection of dates is called: "Thursday, 15 October", "15 – 17 Oct", "4 dates". */
export const selectionTitle = (keys: string[]) =>
  keys.length === 1 ? fullDate(keys[0]) : isContiguous(keys) ? formatSpan(keys[0], keys[keys.length - 1]) : `${keys.length} dates`;

export type DayStatus = "regular" | "closed" | "off" | "custom";

/** The hours that apply on a date: its own change, else its weekday's. */
export const hoursOn = (s: Schedule, key: string): { status: DayStatus; ranges: Range[]; note: string } => {
  const change = s.overrides[key];
  if (change) return { status: change.ranges.length ? "custom" : "off", ranges: sortRanges(change.ranges), note: change.note };
  const ranges = sortRanges(s.week[weekdayOf(key)] ?? []);
  return { status: ranges.length ? "regular" : "closed", ranges, note: "" };
};

/** Upcoming date changes, with runs of consecutive days off (same note) merged. */
export function groupChanges(overrides: OverrideMap, today: string) {
  const groups: { keys: string[]; off: boolean; note: string }[] = [];
  for (const key of Object.keys(overrides).filter((k) => k >= today).sort()) {
    const change = overrides[key];
    const off = change.ranges.length === 0;
    const note = change.note.trim();
    const last = groups[groups.length - 1];
    if (last && off && last.off && last.note === note && daysBetween(last.keys[last.keys.length - 1], key) === 1) last.keys.push(key);
    else groups.push({ keys: [key], off, note });
  }
  return groups;
}

/** Minutes since midnight right now in `zone`. */
export const nowIn = (zone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return get("hour") * 60 + get("minute");
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
};

/** "Today", "Tomorrow" or "Thu, 15 Oct". */
export const relativeDay = (key: string, today: string) =>
  key === today ? "Today" : key === addDays(today, 1) ? "Tomorrow" : shortDate(key);

/**
 * The first consultation start patients could pick, ignoring existing
 * bookings: inside the hours, past the minimum notice, within the window.
 */
export function nextOpening(s: Schedule, today: string, now: number): { key: string; time: string } | null {
  const earliest = now + s.noticeMinutes;
  for (let d = 0; d <= s.windowDays; d++) {
    const key = addDays(today, d);
    for (const r of hoursOn(s, key).ranges) {
      for (let t = minutes(r.startTime); t + s.consultationMinutes <= minutes(r.endTime); t += s.consultationMinutes) {
        if (d * 1440 + t >= earliest) return { key, time: toTime(t) };
      }
    }
  }
  return null;
}

/** Same weekly hours, ignoring order and how back-to-back hours are split. */
export const sameWeek = (a: WeekMap, b: WeekMap) =>
  WEEK_ORDER.every((d) => JSON.stringify(mergeRanges(a[d] ?? [])) === JSON.stringify(mergeRanges(b[d] ?? [])));

/** Minutes of open hours across a week. */
export const weekMinutes = (week: WeekMap) =>
  Object.values(week).flat().reduce((sum, r) => sum + Math.max(0, minutes(r.endTime) - minutes(r.startTime)), 0);

/* ----------------------------- Zones ----------------------------------- */

/** "India (IST, GMT+5:30)"-style label: "Asia/Kolkata · GMT+5:30". */
export const zoneLabel = (zone: string) => {
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${zone.replace(/_/g, " ")} · ${offset}` : zone.replace(/_/g, " ");
  } catch {
    return zone;
  }
};

export const isValidZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/* ----------------------------- API mapping ----------------------------- */

const toRange = (r: { startTime: string; endTime: string }): Range => ({ startTime: r.startTime, endTime: r.endTime });

export const fromApi = (s: DoctorSchedule): Schedule => {
  const week: WeekMap = {};
  for (const r of s.weekly) (week[r.dayOfWeek] ||= []).push(toRange(r));
  for (const day of Object.keys(week)) week[Number(day)] = sortRanges(week[Number(day)]);
  const overrides: OverrideMap = {};
  for (const o of s.overrides) overrides[o.date] = { ranges: sortRanges(o.ranges.map(toRange)), note: o.note ?? "" };
  return {
    week,
    overrides,
    timezone: s.timezone && isValidZone(s.timezone) ? s.timezone : browserTimeZone(),
    consultationMinutes: s.consultationMinutes || 30,
    windowDays: s.bookingWindowDays || 14,
    noticeMinutes: s.minNoticeMinutes ?? 15
  };
};

export const toApi = (s: Schedule) => ({
  timezone: s.timezone,
  consultationMinutes: s.consultationMinutes,
  bookingWindowDays: s.windowDays,
  minNoticeMinutes: s.noticeMinutes,
  weekly: WEEK_ORDER.flatMap((day) => sortRanges(s.week[day] ?? []).map((r) => ({ dayOfWeek: day, ...r }))),
  overrides: Object.keys(s.overrides)
    .sort()
    .map((date) => ({ date, ranges: sortRanges(s.overrides[date].ranges), note: s.overrides[date].note.trim() }))
});

/** The first thing in a schedule that can't be saved, or null. */
export const scheduleProblem = (s: Schedule) => {
  for (const day of WEEK_ORDER) {
    const e = firstError(s.week[day] ?? [], s.consultationMinutes);
    if (e) return `${DAYS[day]}: ${e}`;
  }
  for (const key of Object.keys(s.overrides).sort()) {
    const e = firstError(s.overrides[key].ranges, s.consultationMinutes);
    if (e) return `${shortDate(key)}: ${e}`;
  }
  return null;
};
