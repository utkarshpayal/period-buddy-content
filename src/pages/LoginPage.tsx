import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, AlertCircle, KeyRound, Check, Clock } from "lucide-react";
import { useAppContext } from "../context/AppContext";

export const LoginPage: React.FC = () => {
  const { login, apiMessage, authSession, sessionExpired, clearSessionExpired } = useAppContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Once a fresh session exists, leave the login screen for the studio.
  useEffect(() => {
    if (authSession?.token) {
      const t = setTimeout(() => navigate("/", { replace: true }), 600);
      return () => clearTimeout(t);
    }
  }, [authSession?.token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    clearSessionExpired();

    if (!email.trim() || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    const success = await login({ email: email.trim(), password });
    setIsLoading(false);

    if (!success) {
      setErrorMsg(apiMessage || "Invalid credentials. Please try again.");
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">PB</div>
          <h2>Period Buddy</h2>
          <p className="subtitle">Content & CMS Studio</p>
        </div>

        {authSession ? (
          <div className="login-success-state">
            <div className="success-icon-wrapper">
              <Check size={28} />
            </div>
            <h3>Successfully Signed In</h3>
            <p className="user-email">{authSession.user?.email}</p>
            <p className="success-desc">
              You are signed in as an administrator. Use the sidebar to navigate the studio.
            </p>
          </div>
        ) : (
          <form className="login-form-pane" onSubmit={handleSubmit}>
            <div className="form-header">
              <KeyRound size={18} />
              <span>Admin Authentication</span>
            </div>

            {sessionExpired && !errorMsg && (
              <div className="login-info-alert">
                <Clock size={16} />
                <span>Your session expired. Please sign in again to continue.</span>
              </div>
            )}

            {errorMsg && (
              <div className="login-error-alert">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="email-input">Email Address</label>
              <input
                id="email-input"
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@periodbuddy.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="input-group">
              <label htmlFor="password-input">Password</label>
              <input
                id="password-input"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
            </div>

            <button className="btn-login-submit" disabled={isLoading} type="submit">
              {isLoading ? (
                <>
                  <Loader2 className="spin-icon" size={18} />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>

            {import.meta.env.DEV && (
              <div className="login-help-text">
                <p>Dev login: utkarsh12march2004@gmail.com / password123</p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
