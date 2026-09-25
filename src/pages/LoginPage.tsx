import React, { useState } from "react";
import { AlertCircle, Clock, Eye, EyeOff, FileText, Loader2, LogIn, Smartphone, Stethoscope } from "lucide-react";
import { useAppContext } from "../context/AppContext";

/**
 * One sign-in for everyone who works on Nura: content, app and clinical
 * staff land in the Admin Workspace scoped to their role; gynecologists land
 * in the clinician portal. Routing happens in App.tsx once the session exists.
 */
export const LoginPage: React.FC = () => {
  const { login, sessionExpired, clearSessionExpired } = useAppContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    clearSessionExpired();

    if (!email.trim() || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    const error = await login({ email: email.trim(), password });
    setIsLoading(false);
    if (error) setErrorMsg(error || "Invalid credentials. Please try again.");
  };

  return (
    <div className="auth-screen">
      <aside className="auth-aside" aria-hidden>
        <div className="auth-aside-brand">
          <img src="/images/logo.png" alt="" />
          <span>The Nura Care</span>
        </div>
        <div className="auth-aside-copy">
          <h1>One workspace for everyone behind Nura.</h1>
          <p>Sign in with your work account. You'll only see the tools your role needs.</p>
        </div>
        <ul className="auth-aside-list">
          <li><FileText size={18} /> Content teams write, review and publish</li>
          <li><Smartphone size={18} /> App teams run users, pushes and plans</li>
          <li><Stethoscope size={18} /> Gynecologists manage consultations</li>
        </ul>
      </aside>

      <main className="auth-main">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <img className="auth-form-logo" src="/images/logo.png" alt="The Nura Care" />
          <h2>Welcome back</h2>
          <p className="auth-form-sub">Sign in to your Nura workspace</p>

          {sessionExpired && !errorMsg && (
            <div className="login-info-alert">
              <Clock size={16} />
              <span>Your session expired. Please sign in again to continue.</span>
            </div>
          )}

          {errorMsg && (
            <div className="login-error-alert" role="alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <label className="auth-field">
            <span>Work email</span>
            <input
              autoComplete="email"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@thenura.care"
              type="email"
              value={email}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="auth-password">
              <input
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button className="auth-submit" disabled={isLoading} type="submit">
            {isLoading ? <Loader2 className="spin-icon" size={18} /> : <LogIn size={18} />}
            {isLoading ? "Signing in…" : "Sign in"}
          </button>

          <p className="auth-foot">
            New to the team? Use the invitation link in your email to set your password.
          </p>
        </form>
      </main>
    </div>
  );
};
