import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarCheck,
  Wallet,
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import {
  DashboardData,
  getDashboard,
  updateMyProfile,
  patientName,
  formatMoney
} from "../../api/doctorApi";
import { GynacHead } from "./GynacHead";

export const GynacDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAvailable = async () => {
    if (!data) return;
    setToggling(true);
    try {
      await updateMyProfile({ isAvailable: !data.doctor.isAvailable });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update availability.");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace-page">
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="workspace-page">
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error ?? "No data available."}</span>
        </div>
      </div>
    );
  }

  const { doctor, stats, recentBookings } = data;
  const currency = stats.currency || "INR";

  return (
    <div className="workspace-page">
      <GynacHead
        title={`Welcome, ${doctor.name}`}
        subtitle={`${doctor.specialty} · ⭐ ${doctor.rating?.toFixed(1) ?? "—"}`}
        actions={
          <button
            className={`gy-btn ${doctor.isAvailable ? "gy-btn-ok" : "gy-btn-ghost"}`}
            onClick={toggleAvailable}
            disabled={toggling}
            type="button"
          >
            {toggling ? <Loader2 className="spin-icon" size={16} /> : <Activity size={16} />}
            {doctor.isAvailable ? "Available for bookings" : "Currently paused"}
          </button>
        }
      />

      <section className="gy-stat-grid">
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-rose"><CalendarCheck size={20} /></div>
          <div>
            <p className="gy-stat-value">{stats.totalBookings}</p>
            <p className="gy-stat-label">Total bookings</p>
          </div>
        </article>
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-blue"><Activity size={20} /></div>
          <div>
            <p className="gy-stat-value">{stats.active}</p>
            <p className="gy-stat-label">Active sessions</p>
          </div>
        </article>
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-amber"><Clock size={20} /></div>
          <div>
            <p className="gy-stat-value">{stats.paid}</p>
            <p className="gy-stat-label">Awaiting start</p>
          </div>
        </article>
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-green"><CheckCircle2 size={20} /></div>
          <div>
            <p className="gy-stat-value">{stats.completed}</p>
            <p className="gy-stat-label">Completed</p>
          </div>
        </article>
        <article className="gy-stat-card gy-stat-wide">
          <div className="gy-stat-icon gy-icon-rose"><Wallet size={20} /></div>
          <div>
            <p className="gy-stat-value">{formatMoney(stats.totalEarnings, currency)}</p>
            <p className="gy-stat-label">Total earnings · {stats.paidSessions} paid sessions</p>
          </div>
        </article>
      </section>

      <section className="gy-card">
        <div className="gy-card-head">
          <h3>Recent bookings</h3>
          <Link className="gy-link" to="/bookings">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {recentBookings.length === 0 ? (
          <p className="gy-muted">No bookings yet.</p>
        ) : (
          <div className="gy-table">
            <div className="gy-tr gy-th">
              <span>Patient</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Booked</span>
            </div>
            {recentBookings.map((b) => (
              <div className="gy-tr" key={b._id}>
                <span>{patientName(b.userId)}</span>
                <span>
                  <em className={`gy-pill gy-status-${b.status}`}>{b.status}</em>
                </span>
                <span>{formatMoney(b.amountPaid, b.currency || currency)}</span>
                <span className="gy-muted">
                  {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
