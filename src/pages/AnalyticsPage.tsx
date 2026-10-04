import React, { useEffect, useState } from "react";
import {
  Loader2,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Stethoscope,
  CalendarCheck,
  IndianRupee,
  Landmark,
  FileText,
  Film,
  RefreshCw
} from "lucide-react";
import { getAnalytics, PlatformAnalytics } from "../api/adminApi";

type Tone = "rose" | "plum" | "teal" | "amber" | "green";

const Metric: React.FC<{
  icon: React.ReactNode;
  tone: Tone;
  label: string;
  value: React.ReactNode;
  hint?: string;
}> = ({ icon, tone, label, value, hint }) => (
  <div className="admin-metric">
    <div className="admin-metric-top">
      <span className={`admin-metric-icon i-${tone}`}>{icon}</span>
      <span className="admin-metric-label">{label}</span>
    </div>
    <div className="admin-metric-value">{value}</div>
    {hint && <div className="admin-metric-hint">{hint}</div>}
  </div>
);

const ROLE_TONE: Record<string, Tone> = { user: "rose", partner: "plum", doctor: "teal", admin: "amber" };

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAnalytics());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Platform Analytics</h2>
          <p className="subtitle-text">Aggregate, non-identifying metrics across the platform.</p>
        </div>
        <button type="button" className="gy-btn gy-btn-ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin-icon" size={16} /> : <RefreshCw size={16} />} Refresh
        </button>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading analytics…</p>
        </div>
      ) : data ? (
        <>
          <p className="admin-section-title" style={{ marginTop: 4 }}>Users</p>
          <div className="admin-metric-grid">
            <Metric icon={<Users size={17} />} tone="rose" label="Total users" value={data.users.total} />
            <Metric icon={<UserCheck size={17} />} tone="green" label="Active" value={data.users.active} />
            <Metric icon={<UserX size={17} />} tone="rose" label="Suspended" value={data.users.suspended} />
            <Metric
              icon={<UserPlus size={17} />}
              tone="teal"
              label="New signups"
              value={data.users.newLast7Days}
              hint={`last 7 days · ${data.users.newLast30Days} in 30d`}
            />
          </div>

          <p className="admin-section-title">Users by role</p>
          <div className="admin-metric-grid">
            {Object.entries(data.users.byRole).map(([r, n]) => (
              <Metric key={r} icon={<Users size={17} />} tone={ROLE_TONE[r] || "plum"} label={r} value={n} />
            ))}
          </div>

          <p className="admin-section-title">Gynacs</p>
          <div className="admin-metric-grid">
            <Metric icon={<Stethoscope size={17} />} tone="teal" label="Total gynacs" value={data.doctors.total} />
            <Metric icon={<Stethoscope size={17} />} tone="green" label="Active" value={data.doctors.active} />
          </div>

          <p className="admin-section-title">Consultations</p>
          <div className="admin-metric-grid">
            {Object.entries(data.consultations.byStatus).map(([s, n]) => (
              <Metric key={s} icon={<CalendarCheck size={17} />} tone="plum" label={s} value={n} />
            ))}
            <Metric
              icon={<IndianRupee size={17} />}
              tone="amber"
              label="Revenue (paid)"
              value={`₹${data.consultations.revenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
            />
          </div>

          <p className="admin-section-title">Content &amp; schemes</p>
          <div className="admin-metric-grid">
            <Metric
              icon={<Landmark size={17} />}
              tone="rose"
              label="Govt. schemes"
              value={data.schemes.total}
              hint={`${data.schemes.active} active`}
            />
            <Metric icon={<FileText size={17} />} tone="teal" label="Blogs" value={data.content.blogs} />
            <Metric icon={<Film size={17} />} tone="plum" label="Video reels" value={data.content.reels} />
          </div>

          <p className="admin-metric-hint" style={{ marginTop: 22 }}>
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      ) : null}
    </div>
  );
};
