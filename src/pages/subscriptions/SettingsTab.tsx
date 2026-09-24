import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import {
  SubscriptionSettings,
  getSubscriptionSettings,
  updateSubscriptionSettings
} from "../../api/subscriptionApi";
import { useNoticeToast, useToast } from "../../components/Toast";

export const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSubscriptionSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscription settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (updates: Partial<SubscriptionSettings>) => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateSubscriptionSettings(updates);
      setSettings(next);
      setNotice("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="gy-empty">
        <Loader2 size={20} className="spin" />
        <span>Loading settings…</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="gy-alert gy-alert-error">
        <AlertCircle size={16} />
        <span>{error ?? "Settings could not be loaded."}</span>
      </div>
    );
  }

  return (
    <div className="settings-container">
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <section className="settings-card">
        <div className="card-title-row">
          <ShieldCheck size={20} className="card-icon" />
          <h3>Master switch</h3>
        </div>
        <p className="subtitle-text">
          Turn the whole subscription system off and every feature becomes free for every user —
          nothing is deleted, so you can turn it back on any time with all pricing intact.
        </p>
        <label className="gy-switch" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.subscriptionEnabled}
            disabled={saving}
            onChange={(e) => save({ subscriptionEnabled: e.target.checked })}
          />
          <span className="gy-switch-track" aria-hidden />
          <span>{settings.subscriptionEnabled ? "Subscriptions are ON" : "Subscriptions are OFF — everything is free"}</span>
        </label>
      </section>

      <section className="settings-card">
        <div className="card-title-row">
          <ShieldCheck size={20} className="card-icon" />
          <h3>Purchasing options</h3>
        </div>

        <div className="settings-details">
          <div className="detail-row">
            <span className="detail-label">Currency</span>
            <select
              className="gy-inline-select"
              value={settings.currency}
              disabled={saving}
              onChange={(e) => save({ currency: e.target.value })}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          <div className="detail-row">
            <span className="detail-label">Individual feature purchases</span>
            <label className="gy-switch">
              <input
                type="checkbox"
                checked={settings.allowFeatureWisePurchase}
                disabled={saving}
                onChange={(e) => save({ allowFeatureWisePurchase: e.target.checked })}
              />
              <span className="gy-switch-track" aria-hidden />
              <span>{settings.allowFeatureWisePurchase ? "Allowed" : "Plans only"}</span>
            </label>
          </div>

          <div className="detail-row">
            <span className="detail-label">Grace period after expiry (days)</span>
            <input
              type="number"
              min={0}
              className="gy-inline-input"
              defaultValue={settings.graceDays}
              disabled={saving}
              onBlur={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0);
                if (value !== settings.graceDays) save({ graceDays: value });
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
