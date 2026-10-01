import React, { useEffect } from "react";
import { AlertCircle, AlertTriangle, Info, Search, X } from "lucide-react";

/*
 * Building blocks for the commission / wallet pages (styles/finance.css):
 * Commission & Payouts in the Admin Workspace and Earnings & Wallet in the
 * clinician portal. Presentational only.
 */

export const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}> = ({ value, onChange, placeholder, label }) => (
  <label className="cf-search">
    <Search size={16} aria-hidden />
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} />
  </label>
);

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="cf-segment" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "is-active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count ? <span className="cf-segment-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export type KpiTone = "brand" | "accent" | "teal" | "amber";

export const Kpi: React.FC<{ icon: React.ReactNode; tone?: KpiTone; label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({
  icon,
  tone = "brand",
  label,
  value,
  hint
}) => (
  <div className="cf-kpi">
    <div className="cf-kpi-head">
      <span className={`cf-kpi-icon is-${tone}`} aria-hidden>{icon}</span>
      {label}
    </div>
    <div className="cf-kpi-value">{value}</div>
    {hint && <div className="cf-kpi-hint">{hint}</div>}
  </div>
);

export type PillTone = "ok" | "warn" | "info" | "danger" | "muted";

export const Pill: React.FC<{ tone: PillTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`cf-pill is-${tone}`}>{children}</span>
);

export const Notice: React.FC<{ tone: "info" | "warn" | "error"; children: React.ReactNode; action?: React.ReactNode }> = ({
  tone,
  children,
  action
}) => {
  const Icon = tone === "info" ? Info : tone === "warn" ? AlertTriangle : AlertCircle;
  return (
    <div className={`cf-notice is-${tone} ${action ? "is-action" : ""}`} role={tone === "error" ? "alert" : "status"}>
      <span style={{ display: "flex", gap: 10 }}>
        <Icon size={16} aria-hidden />
        <span>{children}</span>
      </span>
      {action}
    </div>
  );
};

export const EmptyRow: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  children,
  action
}) => (
  <div className="cf-empty">
    {icon}
    <strong>{title}</strong>
    {children && <span>{children}</span>}
    {action}
  </div>
);

/** Centered dialog (a bottom sheet on phones). Escape and the backdrop close it. */
export const Modal: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}> = ({ title, subtitle, onClose, onSubmit, footer, children, width }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <>
      <div className="cf-modal-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="cf-icon-btn" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="cf-modal-body">{children}</div>
      <div className="cf-modal-foot">{footer}</div>
    </>
  );

  return (
    <div className="cf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {onSubmit ? (
        <form className="cf-modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined} onSubmit={onSubmit} noValidate>
          {body}
        </form>
      ) : (
        <div className="cf-modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
          {body}
        </div>
      )}
    </div>
  );
};

export const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; full?: boolean; htmlFor?: string; children: React.ReactNode }> = ({
  label,
  hint,
  full,
  htmlFor,
  children
}) => (
  <div className={`cf-field ${full ? "is-full" : ""}`}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <small>{hint}</small>}
  </div>
);

export const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: React.ReactNode; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  disabled
}) => (
  <label className="cf-switch">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="cf-switch-track" aria-hidden />
    <span className="cf-switch-label">{label}</span>
  </label>
);
