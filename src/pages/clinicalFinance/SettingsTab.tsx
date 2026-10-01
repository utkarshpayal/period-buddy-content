import React, { useEffect, useState } from "react";
import { Loader2, Percent, Send } from "lucide-react";
import { PayoutSettings, PayoutSettingsInput, getPayoutSettings, updatePayoutSettings } from "../../api/financeApi";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { Field, Switch } from "../../components/financeUi";
import { ErrorAlert, Loading, errorText } from "./shared";

type Form = {
  defaultCommissionPercent: string;
  holdDays: string;
  autoReleaseDays: string;
  minWithdrawal: string;
  maxWithdrawal: string;
  newMethodCooldownHours: string;
};

const toForm = (s: PayoutSettings): Form => ({
  defaultCommissionPercent: String(s.defaultCommissionPercent),
  holdDays: String(s.holdDays),
  autoReleaseDays: String(s.autoReleaseDays),
  minWithdrawal: String(s.minWithdrawal),
  maxWithdrawal: String(s.maxWithdrawal),
  newMethodCooldownHours: String(s.newMethodCooldownHours)
});

const Suffix: React.FC<{ unit: string; children: React.ReactNode }> = ({ unit, children }) => (
  <div className="cf-input-suffix">
    {children}
    <span>{unit}</span>
  </div>
);

export const SettingsTab: React.FC = () => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.PAYOUTS_MANAGE);
  const toast = useToast();
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPayoutSettings()
      .then((s) => {
        setSettings(s);
        setForm(toForm(s));
      })
      .catch((err) => setError(errorText(err, "Could not load settings.")));
  }, []);

  const save = async (updates: PayoutSettingsInput, message = "Settings saved.") => {
    setSaving(true);
    try {
      const next = await updatePayoutSettings(updates);
      setSettings(next);
      setForm(toForm(next));
      toast.success(message);
    } catch (err) {
      toast.error(errorText(err, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  };

  const saveRules = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !settings) return;
    const n = (v: string) => Number(v);
    const int = (v: string, min: number, max: number) => Number.isInteger(n(v)) && n(v) >= min && n(v) <= max;
    const commission = n(form.defaultCommissionPercent);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) return toast.error("Commission must be between 0 and 100%.");
    if (!int(form.holdDays, 0, 60)) return toast.error("Hold period must be 0 to 60 days.");
    if (!int(form.autoReleaseDays, 0, 90)) return toast.error("Auto-release must be 0 to 90 days.");
    if (!(n(form.minWithdrawal) >= 1) || !(n(form.maxWithdrawal) >= 1)) return toast.error("Withdrawal limits must be at least ₹1.");
    if (n(form.minWithdrawal) > n(form.maxWithdrawal)) return toast.error("The minimum can't be more than the maximum.");
    if (!int(form.newMethodCooldownHours, 0, 168)) return toast.error("Waiting time must be 0 to 168 hours.");
    if (
      commission !== settings.defaultCommissionPercent &&
      !window.confirm(`Change the default commission from ${settings.defaultCommissionPercent}% to ${commission}%? It applies to sessions paid from now on, for every doctor without a custom rate.`)
    ) {
      return;
    }
    save({
      defaultCommissionPercent: commission,
      holdDays: n(form.holdDays),
      autoReleaseDays: n(form.autoReleaseDays),
      minWithdrawal: n(form.minWithdrawal),
      maxWithdrawal: n(form.maxWithdrawal),
      newMethodCooldownHours: n(form.newMethodCooldownHours)
    });
  };

  if (!settings || !form) return error ? <ErrorAlert message={error} /> : <Loading label="Loading settings…" />;

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings));

  return (
    <div className="cf-stack">
      <section className="cf-section">
        <div className="cf-section-head">
          <h3><Send size={17} /> Withdrawals</h3>
          <p>How doctors get paid. Changes here apply straight away.</p>
        </div>
        <div className="cf-section-body">
          <div className="cf-setting">
            <div className="cf-setting-text">
              <strong>Payment method</strong>
              <span>
                {settings.payoutsConfigured
                  ? "Manual: you transfer and mark paid. Cashfree: sent automatically."
                  : "Cashfree Payouts isn't connected on the server yet, so withdrawals are paid manually."}
              </span>
            </div>
            <select
              className="cf-select"
              value={settings.payoutProvider}
              disabled={!canManage || saving}
              onChange={(e) => save({ payoutProvider: e.target.value as PayoutSettings["payoutProvider"] })}
              aria-label="Payment method"
            >
              <option value="manual">Manual bank transfer</option>
              <option value="cashfree" disabled={!settings.payoutsConfigured}>
                Cashfree Payouts{settings.payoutsConfigured ? "" : " (not connected)"}
              </option>
            </select>
          </div>
          <div className="cf-setting">
            <div className="cf-setting-text">
              <strong>Accept withdrawal requests</strong>
              <span>Turn off to pause new requests. Ones already requested are not affected.</span>
            </div>
            <Switch
              checked={settings.payoutsEnabled}
              disabled={!canManage || saving}
              onChange={(on) => save({ payoutsEnabled: on }, on ? "Withdrawals turned on." : "Withdrawals paused.")}
              label={settings.payoutsEnabled ? "On" : "Paused"}
            />
          </div>
          {settings.activeProvider === "cashfree" && (
            <div className="cf-setting">
              <div className="cf-setting-text">
                <strong>Approve each withdrawal</strong>
                <span>When off, Cashfree withdrawals are sent as soon as a doctor requests them.</span>
              </div>
              <Switch
                checked={settings.requireApproval}
                disabled={!canManage || saving}
                onChange={(on) => {
                  if (!on && !window.confirm("Turn off approval? Withdrawals will be sent through Cashfree as soon as doctors request them.")) return;
                  save({ requireApproval: on });
                }}
                label={settings.requireApproval ? "Required" : "Automatic"}
              />
            </div>
          )}
        </div>
      </section>

      <form className="cf-section" onSubmit={saveRules} noValidate>
        <div className="cf-section-head">
          <h3><Percent size={17} /> Commission &amp; limits</h3>
          <p>Commission changes apply to sessions paid after you save.</p>
        </div>
        <fieldset className="cf-section-body is-form" disabled={!canManage || saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
          <div className="cf-form-grid">
            <Field label="Default commission" hint="Nura's share of each paid session. Doctors with a custom rate keep theirs." htmlFor="cf-s-commission">
              <Suffix unit="%"><input id="cf-s-commission" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={form.defaultCommissionPercent} onChange={set("defaultCommissionPercent")} /></Suffix>
            </Field>
            <Field label="Hold after completion" hint="Refund window before a completed session's earning can be withdrawn." htmlFor="cf-s-hold">
              <Suffix unit="days"><input id="cf-s-hold" type="number" inputMode="numeric" min={0} max={60} value={form.holdDays} onChange={set("holdDays")} /></Suffix>
            </Field>
            <Field label="Auto-release unfinished sessions" hint="Paid sessions nobody marked completed become withdrawable this long after payment. 0 = off." htmlFor="cf-s-auto">
              <Suffix unit="days"><input id="cf-s-auto" type="number" inputMode="numeric" min={0} max={90} value={form.autoReleaseDays} onChange={set("autoReleaseDays")} /></Suffix>
            </Field>
            <Field label="New payout method wait" hint="A new bank account / UPI ID can't be paid to until this passes, in case someone else got into the account." htmlFor="cf-s-cool">
              <Suffix unit="hours"><input id="cf-s-cool" type="number" inputMode="numeric" min={0} max={168} value={form.newMethodCooldownHours} onChange={set("newMethodCooldownHours")} /></Suffix>
            </Field>
            <Field label="Minimum withdrawal" htmlFor="cf-s-min">
              <Suffix unit="₹"><input id="cf-s-min" type="number" inputMode="decimal" min={1} value={form.minWithdrawal} onChange={set("minWithdrawal")} /></Suffix>
            </Field>
            <Field label="Maximum per withdrawal" htmlFor="cf-s-max">
              <Suffix unit="₹"><input id="cf-s-max" type="number" inputMode="decimal" min={1} value={form.maxWithdrawal} onChange={set("maxWithdrawal")} /></Suffix>
            </Field>
          </div>
        </fieldset>
        {canManage && (
          <div className="cf-section-foot">
            <button type="button" className="cf-btn cf-btn-secondary" disabled={!dirty || saving} onClick={() => setForm(toForm(settings))} style={{ marginRight: 8 }}>
              Reset
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={!dirty || saving}>
              {saving && <Loader2 size={16} className="spin" />} Save changes
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
