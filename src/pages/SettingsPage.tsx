import React from "react";
import { Database, Shield, LogOut, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { TwoStepSettings } from "../components/TwoStepSettings";
import { isAdminApiConfigured } from "../api/adminApi";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { DEPARTMENT_LABEL, groupPermissions } from "../auth/access";

export const SettingsPage: React.FC = () => {
  const { authSession, access, logout, apiSource } = useAppContext();

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
  const contentEndpoint = import.meta.env.VITE_CONTENT_ENDPOINT || "/api/content";

  const user = authSession?.user;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || user?.email || "Your account";
  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const permissionGroups = groupPermissions(access?.permissions ?? []);

  return (
    <div className="workspace-page">
      <Header
        title="Account & Settings"
        subtitle="Your account, your access, and the backend this workspace is connected to."
      />

      <ApiBanner />

      <div className="settings-container">
        <section className="settings-card">
          <div className="card-title-row">
            <Shield size={20} className="card-icon" />
            <h3>Your account</h3>
          </div>

          {authSession ? (
            <>
              <div className="settings-profile">
                <span className="settings-avatar" aria-hidden="true">{initials}</span>
                <div className="settings-profile-text">
                  <strong>{fullName}</strong>
                  {user?.email && <span>{user.email}</span>}
                </div>
                <div className="settings-role">
                  <span className="settings-role-name">{access?.roleLabel ?? user?.role ?? "—"}</span>
                  {access?.department && <span className="settings-role-dept">{DEPARTMENT_LABEL[access.department]}</span>}
                </div>
              </div>

              <h4 className="settings-subhead">What you can do</h4>
              {permissionGroups.length ? (
                <ul className="settings-perm-list">
                  {permissionGroups.map((group) => (
                    <li key={group.area}>
                      <span className="settings-perm-area">{group.area}</span>
                      <span className="settings-perm-actions">
                        {group.actions.map((action) => (
                          <span key={action} className="settings-perm-chip">{action}</span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-muted">No workspace permissions on this account.</p>
              )}

              <div className="logout-btn-container">
                <button onClick={logout} className="gy-btn gy-btn-ghost" type="button">
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="settings-empty-state">
              <p>No active administrative session detected.</p>
              <p className="hint">API requests will be sent without Authorization headers (read-only or local sandbox modes).</p>
            </div>
          )}
        </section>

        {authSession && isAdminApiConfigured && (
          <section className="settings-card">
            <div className="card-title-row">
              <KeyRound size={20} className="card-icon" />
              <h3>Two-step sign-in</h3>
            </div>
            <TwoStepSettings />
          </section>
        )}

        <section className="settings-card">
          <div className="card-title-row">
            <Database size={20} className="card-icon" />
            <h3>Connection</h3>
          </div>

          <div className="settings-details">
            <div className="detail-row">
              <span className="detail-label">API base URL</span>
              <code className="detail-value">{apiBaseUrl}</code>
            </div>

            <div className="detail-row">
              <span className="detail-label">Content endpoint</span>
              <code className="detail-value">{contentEndpoint}</code>
            </div>

            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                {apiSource === "api" ? (
                  <span className="status-badge connected">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : (
                  <span className="status-badge local">
                    <AlertCircle size={12} /> Offline: showing saved local content
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
