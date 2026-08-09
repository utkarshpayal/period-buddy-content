import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Save } from "lucide-react";
import { DoctorProfile, getMyProfile, updateMyProfile } from "../../api/doctorApi";
import { GynacHead } from "./GynacHead";

export const GynacProfile: React.FC = () => {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [languagesText, setLanguagesText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setProfile(p);
        setLanguagesText((p.languages ?? []).join(", "));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (patch: Partial<DoctorProfile>) =>
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateMyProfile({
        name: profile.name,
        specialty: profile.specialty,
        pricePerSession: Number(profile.pricePerSession),
        currency: profile.currency,
        bio: profile.bio,
        experience: profile.experience,
        hospital: profile.hospital,
        avatarEmoji: profile.avatarEmoji,
        languages: languagesText.split(",").map((l) => l.trim()).filter(Boolean)
      });
      setProfile(updated);
      setLanguagesText((updated.languages ?? []).join(", "));
      setNotice("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace-page">
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading profile…</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="workspace-page">
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="workspace-page">
      <GynacHead title="My Profile" subtitle="How you appear to patients on Period Buddy." />

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="gy-alert gy-alert-ok">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      <section className="gy-card gy-form-card">
        <form className="gy-form-grid" onSubmit={save}>
          <label className="gy-field">
            <span>Display name</span>
            <input value={profile.name} onChange={(e) => set({ name: e.target.value })} required />
          </label>
          <label className="gy-field">
            <span>Specialty</span>
            <input value={profile.specialty} onChange={(e) => set({ specialty: e.target.value })} required />
          </label>
          <label className="gy-field">
            <span>Avatar emoji</span>
            <input value={profile.avatarEmoji ?? ""} onChange={(e) => set({ avatarEmoji: e.target.value })} />
          </label>
          <label className="gy-field">
            <span>Experience</span>
            <input value={profile.experience ?? ""} onChange={(e) => set({ experience: e.target.value })} />
          </label>
          <label className="gy-field">
            <span>Price / session</span>
            <input
              type="number"
              min={0}
              value={profile.pricePerSession}
              onChange={(e) => set({ pricePerSession: Number(e.target.value) })}
            />
          </label>
          <label className="gy-field">
            <span>Currency</span>
            <select value={profile.currency ?? "INR"} onChange={(e) => set({ currency: e.target.value })}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </label>
          <label className="gy-field gy-field-full">
            <span>Hospital / Clinic</span>
            <input value={profile.hospital ?? ""} onChange={(e) => set({ hospital: e.target.value })} />
          </label>
          <label className="gy-field gy-field-full">
            <span>Languages (comma separated)</span>
            <input value={languagesText} onChange={(e) => setLanguagesText(e.target.value)} />
          </label>
          <label className="gy-field gy-field-full">
            <span>Bio</span>
            <textarea rows={4} value={profile.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} />
          </label>
          <div className="gy-form-actions gy-field-full">
            <button className="gy-btn gy-btn-primary" type="submit" disabled={saving}>
              {saving ? <Loader2 className="spin-icon" size={16} /> : <Save size={16} />}
              Save profile
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
