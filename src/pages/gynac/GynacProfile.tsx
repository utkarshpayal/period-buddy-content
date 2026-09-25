import React, { useEffect, useState } from "react";
import { Building2, Clock, Globe2, Loader2, Save, Star } from "lucide-react";
import { DoctorProfile, formatMoney, getMyProfile, updateMyProfile } from "../../api/doctorApi";
import { Card, ErrorState, PageHeader, PageSkeleton } from "../../components/ui";
import { useNoticeToast } from "../../components/Toast";

export const GynacProfile: React.FC = () => {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));
  const [languagesText, setLanguagesText] = useState("");
  const [dirty, setDirty] = useState(false);

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

  const set = (patch: Partial<DoctorProfile>) => {
    setDirty(true);
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

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
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton stats={0} rows={8} />;
  if (!profile) {
    return (
      <div className="gx-page">
        <ErrorState message={error ?? "Profile not found."} />
      </div>
    );
  }

  const languages = languagesText.split(",").map((l) => l.trim()).filter(Boolean);
  const BIO_MAX = 600;

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        subtitle="This is how patients see you when they choose a gynecologist in the Nura app."
      />

      {error && <ErrorState message={error} />}

      <div className="gx-profile-layout">
        <form className="gx-card gx-form" onSubmit={save}>
          <fieldset>
            <legend>Identity</legend>
            <div className="gx-form-grid">
              <label className="gx-field">
                <span>Display name</span>
                <input value={profile.name} onChange={(e) => set({ name: e.target.value })} required />
              </label>
              <label className="gx-field">
                <span>Specialty</span>
                <input value={profile.specialty} onChange={(e) => set({ specialty: e.target.value })} required />
              </label>
              <label className="gx-field">
                <span>Avatar emoji</span>
                <input value={profile.avatarEmoji ?? ""} maxLength={4} onChange={(e) => set({ avatarEmoji: e.target.value })} />
                <small>Shown on your card in the app.</small>
              </label>
              <label className="gx-field">
                <span>Experience</span>
                <input value={profile.experience ?? ""} placeholder="e.g. 12 years" onChange={(e) => set({ experience: e.target.value })} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Practice</legend>
            <div className="gx-form-grid">
              <label className="gx-field">
                <span>Consultation fee</span>
                <div className="gx-input-group">
                  <select value={profile.currency ?? "INR"} onChange={(e) => set({ currency: e.target.value })} aria-label="Currency">
                    <option value="INR">₹ INR</option>
                    <option value="USD">$ USD</option>
                    <option value="EUR">€ EUR</option>
                    <option value="GBP">£ GBP</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={profile.pricePerSession}
                    onChange={(e) => set({ pricePerSession: Number(e.target.value) })}
                    aria-label="Price per session"
                  />
                </div>
              </label>
              <label className="gx-field">
                <span>Hospital / clinic</span>
                <input value={profile.hospital ?? ""} onChange={(e) => set({ hospital: e.target.value })} />
              </label>
              <label className="gx-field gx-field-full">
                <span>Languages</span>
                <input
                  value={languagesText}
                  placeholder="English, Hindi"
                  onChange={(e) => {
                    setDirty(true);
                    setLanguagesText(e.target.value);
                  }}
                />
                <small>Separate with commas.</small>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>About you</legend>
            <label className="gx-field gx-field-full">
              <span>Bio</span>
              <textarea
                rows={5}
                maxLength={BIO_MAX}
                value={profile.bio ?? ""}
                placeholder="Your approach, areas of focus, and what patients can expect."
                onChange={(e) => set({ bio: e.target.value })}
              />
              <small className="gx-counter">{(profile.bio ?? "").length}/{BIO_MAX}</small>
            </label>
          </fieldset>

          <div className="gx-form-footer">
            <span className="gx-muted">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            <button className="gx-btn gx-btn-primary" type="submit" disabled={saving || !dirty}>
              {saving ? <Loader2 className="spin-icon" size={16} /> : <Save size={16} />}
              Save profile
            </button>
          </div>
        </form>

        <aside className="gx-profile-preview" aria-label="Preview">
          <p className="gx-eyebrow">Patient view</p>
          <Card className="gx-doctor-card">
            <div className="gx-doctor-card-top">
              <span className="gx-doctor-emoji" aria-hidden>{profile.avatarEmoji || "👩‍⚕️"}</span>
              <div>
                <h3>{profile.name || "Your name"}</h3>
                <p>{profile.specialty || "Specialty"}</p>
                {profile.rating ? (
                  <span className="gx-inline-meta">
                    <Star size={13} className="gx-star" /> {profile.rating.toFixed(1)}
                    {profile.totalConsultations ? ` · ${profile.totalConsultations} consultations` : ""}
                  </span>
                ) : null}
              </div>
            </div>
            <ul className="gx-doctor-facts">
              {profile.experience && <li><Clock size={14} /> {profile.experience} experience</li>}
              {profile.hospital && <li><Building2 size={14} /> {profile.hospital}</li>}
              {languages.length > 0 && <li><Globe2 size={14} /> {languages.join(", ")}</li>}
            </ul>
            {profile.bio && <p className="gx-doctor-bio">{profile.bio}</p>}
            <div className="gx-doctor-cta">
              <span>
                <strong>{formatMoney(profile.pricePerSession, profile.currency || "INR")}</strong> / session
              </span>
              <span className={`gx-avail-pill ${profile.isAvailable ? "is-on" : ""}`}>
                {profile.isAvailable ? "Available" : "Paused"}
              </span>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};
