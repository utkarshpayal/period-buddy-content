import React, { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { twoFactorApi, type TwoFactorStatus } from "../api/authApi";

/**
 * Two-step sign-in for the signed-in staff member or doctor
 * (backend controllers/twoFactorController.js): set up an authenticator app
 * instead of emailed codes, see and replace recovery codes, or turn it off.
 * Rendered on Account & Settings and on the doctor's profile.
 */

type Step =
  | { kind: "idle" }
  | { kind: "setup"; secret: string; qr: string }
  | { kind: "codes"; codes: string[] }
  | { kind: "confirm"; action: "disable" | "codes" };

export const TwoStepSettings: React.FC = () => {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    twoFactorApi
      .status()
      .then((s) => {
        setStatus(s);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load two-step sign-in."));
  }, []);

  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const { secret, otpauthUrl } = await twoFactorApi.setup();
      const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });
      setCode("");
      setStep({ kind: "setup", secret, qr });
    });

  const finishSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the app.");
    return run(async () => {
      const { recoveryCodes } = await twoFactorApi.enable(code.trim());
      setStep({ kind: "codes", codes: recoveryCodes });
      load();
    });
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "confirm") return;
    if (!password) return setError("Enter your password.");
    return run(async () => {
      if (step.action === "disable") {
        await twoFactorApi.disable(password);
        setStep({ kind: "idle" });
      } else {
        const { recoveryCodes } = await twoFactorApi.newRecoveryCodes(password);
        setStep({ kind: "codes", codes: recoveryCodes });
      }
      setPassword("");
      load();
    });
  };

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: they can still select the text */
    }
  };

  const cancel = () => {
    setStep({ kind: "idle" });
    setError(null);
    setPassword("");
    setCode("");
  };

  if (loadError) return <p className="settings-muted">{loadError}</p>;
  if (!status) return <Loader2 className="spin-icon" size={18} />;

  const enabled = status.method === "totp";

  return (
    <div className="twostep">
      <p className="twostep-status">
        {enabled ? <ShieldCheck size={16} /> : <KeyRound size={16} />}
        {enabled
          ? `Authenticator app on. ${status.recoveryCodesLeft} recovery code${status.recoveryCodesLeft === 1 ? "" : "s"} left.`
          : status.required
            ? "You sign in with a code we email you."
            : "Only your password is asked at sign-in."}
      </p>

      {error && (
        <p className="twostep-error" role="alert">
          {error}
        </p>
      )}

      {step.kind === "idle" && (
        <div className="twostep-actions">
          {enabled ? (
            <>
              <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setStep({ kind: "confirm", action: "codes" })}>
                New recovery codes
              </button>
              <button className="gy-btn gy-btn-quiet-danger" type="button" onClick={() => setStep({ kind: "confirm", action: "disable" })}>
                Turn off
              </button>
            </>
          ) : (
            <button className="gy-btn gy-btn-primary" type="button" disabled={busy} onClick={startSetup}>
              {busy ? <Loader2 className="spin-icon" size={16} /> : <Smartphone size={16} />}
              Use an authenticator app
            </button>
          )}
        </div>
      )}

      {step.kind === "setup" && (
        <form className="twostep-panel" onSubmit={finishSetup}>
          <p>Scan this with Google Authenticator, Microsoft Authenticator or 1Password, then enter the code it shows.</p>
          <img loading="lazy" decoding="async" className="twostep-qr" src={step.qr} alt="QR code for your authenticator app" width={200} height={200} />
          <p className="settings-muted">
            Can't scan? Enter this key: <code className="twostep-key">{step.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </p>
          <label className="ws-field">
            <span>Code from the app</span>
            <input
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </label>
          <div className="twostep-actions">
            <button className="gy-btn gy-btn-primary" type="submit" disabled={busy}>
              {busy && <Loader2 className="spin-icon" size={16} />} Turn on
            </button>
            <button className="gy-btn gy-btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {step.kind === "codes" && (
        <div className="twostep-panel">
          <p>
            <strong>Save these recovery codes.</strong> Each one signs you in once if you lose your phone. They won't be
            shown again.
          </p>
          <ul className="twostep-codes">
            {step.codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <div className="twostep-actions">
            <button className="gy-btn gy-btn-ghost" type="button" onClick={() => copyCodes(step.codes)}>
              <Copy size={16} /> {copied ? "Copied" : "Copy"}
            </button>
            <button className="gy-btn gy-btn-primary" type="button" onClick={cancel}>
              I've saved them
            </button>
          </div>
        </div>
      )}

      {step.kind === "confirm" && (
        <form className="twostep-panel" onSubmit={confirm}>
          <p>
            {step.action === "disable"
              ? "Turn off the authenticator app? You'll sign in with emailed codes (if your workspace asks for them)."
              : "Get new recovery codes? The old ones stop working."}
          </p>
          <label className="ws-field">
            <span>Your password</span>
            <input autoFocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="twostep-actions">
            <button className={`gy-btn ${step.action === "disable" ? "gy-btn-danger" : "gy-btn-primary"}`} type="submit" disabled={busy}>
              {busy && <Loader2 className="spin-icon" size={16} />}
              {step.action === "disable" ? "Turn off" : "Get new codes"}
            </button>
            <button className="gy-btn gy-btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
