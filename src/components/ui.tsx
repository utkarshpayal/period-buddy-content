import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/*
 * Small presentational building blocks for the clinician portal (gx-*
 * styles in styles/portal.css). Keep them dumb: no data fetching here.
 */

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions }) => (
  <header className="gx-page-header">
    <div className="gx-page-header-text">
      {eyebrow && <p className="gx-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <p className="gx-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="gx-page-actions">{actions}</div>}
  </header>
);

export const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "berry" | "teal" | "amber" | "green" | "plum";
}> = ({ icon, label, value, hint, tone = "berry" }) => (
  <article className={`gx-stat tone-${tone}`}>
    <span className="gx-stat-icon" aria-hidden>
      {icon}
    </span>
    <div className="gx-stat-body">
      <span className="gx-stat-label">{label}</span>
      <strong className="gx-stat-value">{value}</strong>
      {hint && <span className="gx-stat-hint">{hint}</span>}
    </div>
  </article>
);

const STATUS_TEXT: Record<string, string> = {
  pending: "Unpaid",
  paid: "New",
  active: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => (
  <span className={`gx-badge status-${status}`}>
    <span className="gx-badge-dot" aria-hidden />
    {label ?? STATUS_TEXT[status] ?? status}
  </span>
);

export const Avatar: React.FC<{ name: string; src?: string; size?: "sm" | "md" | "lg" }> = ({
  name,
  src,
  size = "md"
}) => {
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  // Stable hue per name so the same patient always gets the same colour.
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className={`gx-avatar size-${size}`} style={{ "--gx-hue": hue } as React.CSSProperties} aria-hidden>
      {src ? <img loading="lazy" decoding="async" src={src} alt="" /> : initials}
    </span>
  );
};

export const Card: React.FC<{
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  flush?: boolean;
}> = ({ title, action, className = "", children, flush }) => (
  <section className={`gx-card ${flush ? "is-flush" : ""} ${className}`}>
    {(title || action) && (
      <div className="gx-card-head">
        {title && <h2>{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, children, action }) => (
  <div className="gx-empty">
    <span className="gx-empty-icon" aria-hidden>
      {icon}
    </span>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="gx-error" role="alert">
    <AlertCircle size={18} />
    <span>{message}</span>
    {onRetry && (
      <button type="button" className="gx-btn gx-btn-ghost gx-btn-sm" onClick={onRetry}>
        <RefreshCw size={14} /> Retry
      </button>
    )}
  </div>
);

export const Skeleton: React.FC<{ height?: number; width?: string; radius?: number }> = ({
  height = 16,
  width = "100%",
  radius = 8
}) => <span className="gx-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden />;

/** Placeholder layout shown while a page's first load is in flight. */
export const PageSkeleton: React.FC<{ stats?: number; rows?: number }> = ({ stats = 4, rows = 5 }) => (
  <div className="gx-page" aria-busy="true" aria-label="Loading">
    <div className="gx-page-header">
      <div className="gx-page-header-text" style={{ width: "100%" }}>
        <Skeleton width="120px" height={12} />
        <Skeleton width="280px" height={28} />
        <Skeleton width="360px" height={14} />
      </div>
    </div>
    {stats > 0 && (
      <div className="gx-stat-grid">
        {Array.from({ length: stats }).map((_, i) => (
          <Skeleton key={i} height={96} radius={16} />
        ))}
      </div>
    )}
    <div className="gx-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: "10px 0" }}>
          <Skeleton height={18} />
        </div>
      ))}
    </div>
  </div>
);

export type TabItem<T extends string> = { value: T; label: string; count?: number };

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="gx-tabs" role="tablist" aria-label={label}>
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
          {item.count !== undefined && <span className="gx-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Toggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <label className={`gx-toggle ${checked ? "is-on" : ""}`}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="gx-toggle-track" aria-hidden>
      <span className="gx-toggle-thumb" />
    </span>
    <span className="gx-toggle-label">{label}</span>
  </label>
);

export const timeAgo = (iso?: string) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
