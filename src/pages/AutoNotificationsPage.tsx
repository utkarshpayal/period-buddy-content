import React, { useEffect, useState } from "react";
import { BellRing, Loader2, RefreshCw, Users, Baby } from "lucide-react";
import {
  getAutoNotifications,
  setAutoNotification,
  type AutoNotificationsOverview
} from "../api/adminApi";
import { useAppContext } from "../context/AppContext";
import { PERMISSIONS } from "../auth/access";

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

/**
 * Automatic cycle notifications (backend utils/autoNotifications.js): the
 * reminders the app sends on its own — period coming / due / late, fertile
 * window, phase tips, symptom heads-up, health alerts, daily log. Each can
 * be turned off for every user here; people's own switches in the app are
 * kept for when it's back on. Counts only, no one's details.
 */
export const AutoNotificationsPage: React.FC = () => {
  const { can } = useAppContext();
  const canEdit = can(PERMISSIONS.PUSH_BROADCAST);
  const [data, setData] = useState<AutoNotificationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAutoNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load automatic notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (key: string, enabled: boolean, label: string) => {
    if (!enabled && !window.confirm(`Turn off “${label}” for every user? Their own settings are kept.`)) return;
    setBusyKey(key);
    setError(null);
    try {
      setData(await setAutoNotification(key, enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Push notifications</p>
          <h2>Automatic notifications</h2>
          <p className="subtitle-text">
            Reminders the app sends on its own, at each person’s chosen time (9 AM by default), at most 2 a day and never after
            10 PM. Turning one off here stops it for everyone.
          </p>
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
          <p>Loading…</p>
        </div>
      ) : data ? (
        <>
          <div className="admin-metric-grid">
            <div className="admin-metric">
              <div className="admin-metric-top">
                <span className="admin-metric-icon i-rose"><Users size={17} /></span>
                <span className="admin-metric-label">People tracking their cycle</span>
              </div>
              <div className="admin-metric-value">{data.users}</div>
              <div className="admin-metric-hint">who can get these</div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-top">
                <span className="admin-metric-icon i-plum"><Baby size={17} /></span>
                <span className="admin-metric-label">In pregnancy mode</span>
              </div>
              <div className="admin-metric-value">{data.pregnancyMode}</div>
              <div className="admin-metric-hint">cycle reminders paused</div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-top">
                <span className="admin-metric-icon i-teal"><BellRing size={17} /></span>
                <span className="admin-metric-label">Sent, last {data.statsDays} days</span>
              </div>
              <div className="admin-metric-value">{data.categories.reduce((n, c) => n + c.sent, 0)}</div>
              <div className="admin-metric-hint">
                {pct(
                  data.categories.reduce((n, c) => n + c.read, 0),
                  data.categories.reduce((n, c) => n + c.sent, 0)
                )}{" "}
                opened in the app
              </div>
            </div>
          </div>

          <p className="admin-section-title">Categories</p>
          <div className="admin-table-card" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Notification</th>
                  <th>Users with it on</th>
                  <th>Sent ({data.statsDays}d)</th>
                  <th>Opened</th>
                  <th>For everyone</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.key} style={{ opacity: c.enabled ? 1 : 0.6 }}>
                    <td style={{ textAlign: "left" }}>
                      <strong>{c.label}</strong>
                      <div className="admin-metric-hint">
                        {c.description}
                        {c.defaultOn ? "" : " · off unless the person turns it on"}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {c.usersOn} <span className="admin-metric-hint">({pct(c.usersOn, data.users)})</span>
                    </td>
                    <td style={{ textAlign: "center" }}>{c.sent}</td>
                    <td style={{ textAlign: "center" }}>{pct(c.read, c.sent)}</td>
                    <td style={{ textAlign: "center" }}>
                      <label className="gy-switch" title={canEdit ? "" : "Needs the Broadcast to everyone permission"}>
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          disabled={!canEdit || busyKey === c.key}
                          onChange={(e) => toggle(c.key, e.target.checked, c.label)}
                          aria-label={`${c.label} for everyone`}
                        />
                        <span className="gy-switch-track" aria-hidden />
                        <span>{busyKey === c.key ? "Saving…" : c.enabled ? "On" : "Off"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.updatedAt && (
            <p className="admin-metric-hint" style={{ marginTop: 14 }}>
              Last changed {new Date(data.updatedAt).toLocaleString()}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
};
