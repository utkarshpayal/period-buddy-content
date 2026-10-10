import React, { useEffect, useMemo, useState } from "react";
import { AdminDoctor, listDoctorsForAdmin } from "../api/doctorApi";

/** Has this gynac been invited but not set a password yet? */
export const isInvitePending = (d: AdminDoctor) => typeof d.userId === "object" && Boolean(d.userId?.mustSetPassword);
const isDeactivated = (d: AdminDoctor) => typeof d.userId === "object" && d.userId?.isActive === false;

/**
 * Pick a gynecologist (Admin Workspace). Loads the doctor list once per
 * mount; `filter` narrows it (e.g. only invites still pending) and `exclude`
 * hides ids (e.g. the gynac being referred).
 */
export const GynacPicker: React.FC<{
  id?: string;
  value: string;
  onChange: (id: string, doctor: AdminDoctor | null) => void;
  placeholder?: string;
  filter?: (d: AdminDoctor) => boolean;
  exclude?: (string | undefined | null)[];
  /** Include deactivated gynacs (default: only active ones). */
  includeInactive?: boolean;
  disabled?: boolean;
  required?: boolean;
}> = ({ id, value, onChange, placeholder = "Choose a gynecologist", filter, exclude = [], includeInactive, disabled, required }) => {
  const [doctors, setDoctors] = useState<AdminDoctor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    listDoctorsForAdmin()
      .then((rows) => live && setDoctors(rows))
      .catch((err) => live && setError(err instanceof Error ? err.message : "Could not load gynecologists."));
    return () => {
      live = false;
    };
  }, []);

  const options = useMemo(() => {
    const hidden = new Set(exclude.filter(Boolean).map(String));
    const q = query.trim().toLowerCase();
    return (doctors ?? [])
      // The current value always stays listed, so a selection is never invisible.
      .filter((d) => d._id === value || !hidden.has(d._id))
      .filter((d) => d._id === value || includeInactive || !isDeactivated(d))
      .filter((d) => d._id === value || (filter ? filter(d) : true))
      .filter((d) => !q || d.name.toLowerCase().includes(q) || (d.email ?? "").toLowerCase().includes(q) || d._id === value)
      .sort((a, b) => a.name.localeCompare(b.name));
    // `exclude` is usually an inline array; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, query, value, includeInactive, filter, JSON.stringify(exclude)]);

  if (error) return <p className="cf-help is-danger">{error}</p>;

  return (
    <div className="rf-picker">
      {(doctors?.length ?? 0) > 8 && (
        <input
          type="search"
          className="rf-picker-search"
          placeholder="Filter by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter gynecologists"
          disabled={disabled}
        />
      )}
      <select
        id={id}
        value={value}
        required={required}
        disabled={disabled || !doctors}
        onChange={(e) => onChange(e.target.value, doctors?.find((d) => d._id === e.target.value) ?? null)}
      >
        <option value="">{doctors ? (options.length ? placeholder : "No matching gynecologists") : "Loading…"}</option>
        {options.map((d) => (
          <option key={d._id} value={d._id}>
            {d.name}
            {d.email ? ` · ${d.email}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
};
