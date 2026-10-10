import React, { useEffect, useState } from "react";
import { Gift, Loader2, Power, ShieldCheck } from "lucide-react";
import { ReferralSettings, getReferralSettings, updateReferralSettings } from "../../api/referralApi";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { Field, Switch } from "../../components/financeUi";
import { ErrorAlert, Loading, errorText } from "../clinicalFinance/shared";

type Form = { rewardSessions: string; creditExpiryDays: string; maxOpenPerDoctor: string };

const toForm = (s: ReferralSettings): Form => ({
  rewardSessions: String(s.rewardSessions),
  creditExpiryDays: s.creditExpiryDays ? String(s.creditExpiryDays) : "",
  maxOpenPerDoctor: String(s.maxOpenPerDoctor)
});

const int = (v: string, min: number, max: number) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

export const ReferralSettingsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.REFERRALS_MANAGE);
  const toast = useToast();
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getReferralSettings()
      .then((s) => {
        setSettings(s);
        setForm(toForm(s));
      })
      .catch((err) => setError(errorText(err, "Could not load settings.")));
  }, []);

  const save = async (
    updates: Partial<Omit<ReferralSettings, "updatedAt">>,
    message = "Settings saved.",
    { keepForm = false } = {}
  ) => {
    setSaving(true);
    try {
      const next = await updateReferralSettings(updates);
      setSettings(next);
      // A switch saved on its own keeps any rule edits still being typed.
      if (!keepForm) setForm(toForm(next));
      toast.success(message);
      onChanged();
    } catch (err) {
      toast.error(errorText(err, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  };

  const saveRules = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!int(form.rewardSessions, 1, 50)) return toast.error("Sessions per referral must be 1 to 50.");
    if (form.creditExpiryDays.trim() && !int(form.creditExpiryDays, 1, 3650)) return toast.error("Expiry must be 1 to 3650 days, or empty for never.");
    if (!int(form.maxOpenPerDoctor, 1, 100)) return toast.error("Open referrals per gynac must be 1 to 100.");
    save({
      rewardSessions: Number(form.rewardSessions),
      creditExpiryDays: form.creditExpiryDays.trim() ? Number(form.creditExpiryDays) : null,
      maxOpenPerDoctor: Number(form.maxOpenPerDoctor)
    });
  };

  if (!settings || !form) return error ? <ErrorAlert message={error} /> : <Loading label="Loading settings…" />;

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings));

  return (
    <div className="cf-stack">
      <section className="cf-section">
        <div className="cf-section-head">
          <h3><Power size={17} /> Program</h3>
          <p>Pausing stops new referrals only.</p>
        </div>
        <div className="cf-section-body">
          <div className="cf-setting">
            <div className="cf-setting-text">
              <strong>Accept new referrals</strong>
              <span>When paused, referrals already invited still earn their reward and free sessions already given keep working.</span>
            </div>
            <Switch
              checked={settings.enabled}
              disabled={!canManage || saving}
              onChange={(on) => {
                if (!on && !window.confirm("Pause the referral program? Gynacs won't be able to send new referrals.")) return;
                save({ enabled: on }, on ? "Referrals turned on." : "Referrals paused.", { keepForm: true });
              }}
              label={settings.enabled ? "On" : "Paused"}
            />
          </div>
        </div>
      </section>

      <section className="cf-section">
        <div className="cf-section-head">
          <h3><ShieldCheck size={17} /> When the reward is given</h3>
          <p>Waiting for a first session stops a gynac rewarding themselves through a second email address.</p>
        </div>
        <div className="cf-section-body">
          <div className="cf-setting">
            <div className="cf-setting-text">
              <strong>Give free sessions</strong>
              <span>
                {settings.rewardTrigger === "first_session"
                  ? "After the referred gynac completes their first paid consultation (checked every 30 minutes)."
                  : "As soon as the referred gynac sets up their account."}
              </span>
            </div>
            <select
              className="cf-select"
              value={settings.rewardTrigger}
              disabled={!canManage || saving}
              aria-label="When the reward is given"
              onChange={(e) =>
                save({ rewardTrigger: e.target.value as ReferralSettings["rewardTrigger"] }, "Reward timing saved.", { keepForm: true })
              }
            >
              <option value="onboarded">When they join</option>
              <option value="first_session">After their first session</option>
            </select>
          </div>
        </div>
      </section>

      <form className="cf-section" onSubmit={saveRules} noValidate>
        <div className="cf-section-head">
          <h3><Gift size={17} /> Reward</h3>
          <p>Changes apply to rewards given from now on; credits already given keep their sessions and expiry.</p>
        </div>
        <fieldset className="cf-section-body is-form" disabled={!canManage || saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
          <div className="cf-form-grid">
            <Field label="Free sessions per referral" hint="Sessions with no Nura commission, given when the referred gynac joins." htmlFor="rf-s-n">
              <input id="rf-s-n" type="number" inputMode="numeric" min={1} max={50} value={form.rewardSessions} onChange={set("rewardSessions")} />
            </Field>
            <Field label="Free sessions expire after (days)" hint="Empty = never expire." htmlFor="rf-s-exp">
              <input id="rf-s-exp" type="number" inputMode="numeric" min={1} max={3650} value={form.creditExpiryDays} onChange={set("creditExpiryDays")} placeholder="Never" />
            </Field>
            <Field label="Open referrals per gynac" hint="How many referrals one gynac can have in review or invited at once." htmlFor="rf-s-max">
              <input id="rf-s-max" type="number" inputMode="numeric" min={1} max={100} value={form.maxOpenPerDoctor} onChange={set("maxOpenPerDoctor")} />
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
