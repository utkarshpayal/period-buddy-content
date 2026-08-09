import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { KeyRound, Loader2, AlertCircle, Check, Stethoscope } from "lucide-react";
import { setPasswordFromInvite } from "../api/doctorApi";

// These keys mirror authApi's private storage keys so a set-password success
// logs the clinician straight in on reload.
const TOKEN_KEY = "period-buddy-api-token";
const USER_KEY = "period-buddy-auth-user";

export const SetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const linkValid = useMemo(() => Boolean(email && token), [email, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await setPasswordFromInvite({ email, token, password });
      if (result.token) localStorage.setItem(TOKEN_KEY, result.token);
      if (result.user) localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      setDone(true);
      // Full reload so AppProvider hydrates the new doctor session and routes
      // into the clinician portal.
      setTimeout(() => {
        window.location.href = "/";
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set your password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">PB</div>
          <h2>Period Buddy</h2>
          <p className="subtitle">Clinician Onboarding</p>
        </div>

        {!linkValid ? (
          <div className="login-error-alert">
            <AlertCircle size={16} />
            <span>This invite link is incomplete or invalid. Please use the link from your email.</span>
          </div>
        ) : done ? (
          <div className="login-success-state">
            <div className="success-icon-wrapper">
              <Check size={28} />
            </div>
            <h3>Password Set</h3>
            <p className="success-desc">Signing you in to the clinician portal…</p>
          </div>
        ) : (
          <form className="login-form-pane" onSubmit={handleSubmit}>
            <div className="form-header">
              <Stethoscope size={18} />
              <span>Welcome, Doctor</span>
            </div>

            <p className="login-help-text" style={{ marginTop: 0 }}>
              Create a password for <strong>{email}</strong> to access your dashboard.
            </p>

            {error && (
              <div className="login-error-alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="pw">New Password</label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="pw2">Confirm Password</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <button className="btn-login-submit" disabled={isLoading} type="submit">
              {isLoading ? (
                <>
                  <Loader2 className="spin-icon" size={18} />
                  <span>Setting Password…</span>
                </>
              ) : (
                <>
                  <KeyRound size={18} />
                  <span>Set Password &amp; Sign In</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
