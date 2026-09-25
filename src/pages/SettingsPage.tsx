import React from "react";
import { Settings, Database, Shield, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";

export const SettingsPage: React.FC = () => {
  const { authSession, access, logout, apiSource } = useAppContext();

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
  const contentEndpoint = import.meta.env.VITE_CONTENT_ENDPOINT || "/api/content";

  return (
    <div className="workspace-page">
      <Header 
        title="Account & Settings"
        subtitle="Your account, your access, and the backend this workspace is connected to."
      />

      <ApiBanner />

      <div className="settings-container">
        {/* Environment Setup card */}
        <section className="settings-card">
          <div className="card-title-row">
            <Database size={20} className="card-icon" />
            <h3>Database & Endpoint Settings</h3>
          </div>

          <div className="settings-details">
            <div className="detail-row">
              <span className="detail-label">API Base URL</span>
              <code className="detail-value">{apiBaseUrl}</code>
            </div>

            <div className="detail-row">
              <span className="detail-label">Content Endpoint</span>
              <code className="detail-value">{contentEndpoint}</code>
            </div>

            <div className="detail-row">
              <span className="detail-label">Connection Strategy</span>
              <span className="detail-value">
                {apiSource === "api" ? (
                  <span className="status-badge connected">
                    <CheckCircle2 size={12} /> Connected (REST + JWT Bearer Token)
                  </span>
                ) : (
                  <span className="status-badge local">
                    <AlertCircle size={12} /> Local Mock Storage (Fallbacks Active)
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Admin Session card */}
        <section className="settings-card">
          <div className="card-title-row">
            <Shield size={20} className="card-icon" />
            <h3>Your Account</h3>
          </div>

          {authSession ? (
            <div className="settings-details">
              <div className="detail-row">
                <span className="detail-label">User Email</span>
                <span className="detail-value">{authSession.user?.email}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Role</span>
                <span className="detail-value">{access?.roleLabel ?? authSession.user?.role ?? "—"}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Permissions</span>
                <span className="detail-value settings-perms">
                  {access?.permissions.length
                    ? access.permissions.map((p) => <code key={p}>{p}</code>)
                    : "—"}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">First Name</span>
                <span className="detail-value">{authSession.user?.firstName || "N/A"}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Last Name</span>
                <span className="detail-value">{authSession.user?.lastName || "N/A"}</span>
              </div>

              <div className="logout-btn-container">
                <button onClick={logout} className="btn-logout-settings" type="button">
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-empty-state">
              <p>No active administrative session detected.</p>
              <p className="hint">API requests will be sent without Authorization headers (read-only or local sandbox modes).</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
