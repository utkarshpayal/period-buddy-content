import React, { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, Circle, Clock, Globe2, Loader2, RotateCcw, Save, Star, X } from "lucide-react";
import {
  DoctorProfile,
  formatMoney,
  getMyProfile,
  getWallet,
  removeMyAvatar,
  updateMyProfile,
  uploadMyAvatar,
  isValidSessionFee,
  MAX_SESSION_FEE,
  MIN_SESSION_FEE,
  SESSION_FEE_ERROR
} from "../../api/doctorApi";
import { DoctorAvatar, PhotoPicker } from "../../components/DoctorPhoto";
import { Card, ErrorState, PageHeader, PageSkeleton } from "../../components/ui";
import { useNoticeToast } from "../../components/Toast";
import { TwoStepSettings } from "../../components/TwoStepSettings";

export const GynacProfile: React.FC = () => {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));
  const [languages, setLanguages] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [registration, setRegistration] = useState("");
  // The fee as typed, so the field can be cleared and retyped.
  const [feeText, setFeeText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // The last saved version, for Discard.
  const saved = useRef<DoctorProfile | null>(null);
  // Nura's cut, to show what the gynac actually receives per session.
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null);

  const loadInto = (p: DoctorProfile) => {
    saved.current = p;
    setProfile(p);
    setLanguages(p.languages ?? []);
    setEducation(p.education ?? []);
    setRegistration((p.licenses ?? []).join(", "));
    setFeeText(p.pricePerSession != null ? String(p.pricePerSession) : "");
    setDirty(false);
  };

  useEffect(() => {
    (async () => {
      try {
        loadInto(await getMyProfile());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
    getWallet()
      .then((w) => setCommissionPercent(w.rules.commissionPercent))
      .catch(() => undefined);
  }, []);

  // Don't lose edits to a closed tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch: Partial<DoctorProfile>) => {
    setDirty(true);
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // The photo saves on its own, straight away, so it doesn't wait on (or
  // discard) unsaved text edits.
  const changePhoto = async (action: () => Promise<DoctorProfile>, done: string) => {
    setPhotoBusy(true);
    setError(null);
    try {
      const updated = await action();
      const avatarUrl = updated.avatarUrl ?? null;
      setProfile((prev) => (prev ? { ...prev, avatarUrl } : prev));
      // Already saved on the server: Discard must not bring the old one back.
      if (saved.current) saved.current = { ...saved.current, avatarUrl };
      setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!feeText.trim() || !isValidSessionFee(Number(feeText))) {
      setError(SESSION_FEE_ERROR);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateMyProfile({
        name: profile.name,
        specialty: profile.specialty,
        pricePerSession: Number(feeText),
        bio: profile.bio,
        experience: profile.experience,
        hospital: profile.hospital,
        languages,
        education,
        // Several registrations (one per state council) stay separate.
        licenses: registration.split(",").map((l) => l.trim()).filter(Boolean)
      });
      loadInto(updated);
      setNotice("Profile updated.");
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

  const BIO_MAX = 600;
  const fee = Number(feeText) || 0;
  const takeHome = commissionPercent === null ? null : Math.round(fee * (1 - commissionPercent / 100));
  const completeness = (
    <Completeness
      items={[
        { id: "pf-photo", label: "Profile photo", done: Boolean(profile.avatarUrl) },
        { id: "pf-experience", label: "Experience", done: Boolean(profile.experience?.trim()) },
        { id: "pf-education", label: "Qualifications", done: education.length > 0 },
        { id: "pf-registration", label: "Registration number", done: Boolean(registration.trim()) },
        { id: "pf-hospital", label: "Hospital or clinic", done: Boolean(profile.hospital?.trim()) },
        { id: "pf-languages", label: "Languages", done: languages.length > 0 },
        { id: "pf-bio", label: "Bio (40+ characters)", done: (profile.bio ?? "").trim().length >= 40 }
      ]}
    />
  );

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        subtitle="This is how patients see you when they choose a gynecologist in the Nura app."
      />

      {error && <ErrorState message={error} />}

      {/* Small screens: completeness first, in reading order. */}
      <div className="pf-complete-top">{completeness}</div>

      <div className="gx-profile-layout">
        <form className="gx-card gx-form" onSubmit={save}>
          <fieldset>
            <legend>Identity</legend>
            <p className="pf-section-lead">Your name, specialty and photo as they appear on your card.</p>
            <div className="gx-form-grid">
              <label className="gx-field">
                <span>Display name</span>
                <input value={profile.name} onChange={(e) => set({ name: e.target.value })} required />
              </label>
              <label className="gx-field">
                <span>Specialty</span>
                <input value={profile.specialty} onChange={(e) => set({ specialty: e.target.value })} required />
              </label>
              <div className="gx-field gx-field-full" id="pf-photo" tabIndex={-1}>
                <span>Profile photo</span>
                <PhotoPicker
                  name={profile.name || "Doctor"}
                  url={profile.avatarUrl}
                  busy={photoBusy}
                  hint="Shown on your card in the app. A clear, friendly headshot works best. Up to 5 MB."
                  avatarClassName="doc-photo-lg"
                  onPick={(file) => changePhoto(() => uploadMyAvatar(file), "Photo updated.")}
                  onRemove={() => changePhoto(removeMyAvatar, "Photo removed.")}
                  onError={setError}
                />
              </div>
              <label className="gx-field">
                <span>Experience</span>
                <input id="pf-experience" value={profile.experience ?? ""} placeholder="e.g. 12 years" onChange={(e) => set({ experience: e.target.value })} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Credentials</legend>
            <p className="pf-section-lead">Shown to patients, and printed on your prescriptions.</p>
            <div className="gx-form-grid">
              <div className="gx-field">
                <label htmlFor="pf-education">Qualifications</label>
                <TagInput
                  id="pf-education"
                  values={education}
                  placeholder={education.length ? "Add another" : "e.g. MBBS, MS (OBG)"}
                  max={8}
                  onChange={(v) => {
                    setDirty(true);
                    setEducation(v);
                  }}
                />
                <small>Press Enter or comma after each one.</small>
              </div>
              <label className="gx-field">
                <span>Medical registration no.</span>
                <input
                  id="pf-registration"
                  value={registration}
                  placeholder="e.g. MMC 2014/05/1234"
                  maxLength={80}
                  onChange={(e) => {
                    setDirty(true);
                    setRegistration(e.target.value);
                  }}
                />
                <small className={registration.trim() ? undefined : "gx-field-warn"}>
                  {registration.trim()
                    ? "Printed on every prescription you write."
                    : "Add it: pharmacies check it on online prescriptions."}
                </small>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Practice</legend>
            <p className="pf-section-lead">What patients pay, where you practise and the languages you consult in.</p>
            <div className="gx-form-grid">
              <label className="gx-field">
                <span>Consultation fee</span>
                <div className="gx-input-group">
                  <span className="gx-input-prefix" aria-hidden>₹ INR</span>
                  <input
                    type="number"
                    min={MIN_SESSION_FEE}
                    max={MAX_SESSION_FEE}
                    step="any"
                    inputMode="decimal"
                    value={feeText}
                    onChange={(e) => {
                      setDirty(true);
                      setFeeText(e.target.value);
                      if (e.target.value.trim() && Number.isFinite(Number(e.target.value))) set({ pricePerSession: Number(e.target.value) });
                    }}
                    aria-label="Price per session in Indian rupees"
                  />
                </div>
                <small>
                  {takeHome !== null && fee > 0
                    ? `You receive about ${formatMoney(takeHome)} per session after Nura's ${commissionPercent}% commission.`
                    : "Between ₹1 and ₹1,00,000. All fees are charged in Indian rupees."}
                </small>
              </label>
              <label className="gx-field">
                <span>Hospital / clinic</span>
                <input id="pf-hospital" value={profile.hospital ?? ""} placeholder="e.g. Apollo Hospitals, Chennai" onChange={(e) => set({ hospital: e.target.value })} />
              </label>
              <div className="gx-field gx-field-full">
                <label htmlFor="pf-languages">Languages</label>
                <TagInput
                  id="pf-languages"
                  values={languages}
                  placeholder={languages.length ? "Add another" : "e.g. English, Hindi"}
                  suggestions={LANGUAGE_SUGGESTIONS}
                  max={10}
                  onChange={(v) => {
                    setDirty(true);
                    setLanguages(v);
                  }}
                />
                <small>Patients can filter by language.</small>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>About you</legend>
            <p className="pf-section-lead">A few lines on your approach. Patients read this before booking.</p>
            <label className="gx-field gx-field-full">
              <span>Bio</span>
              <textarea
                id="pf-bio"
                rows={5}
                maxLength={BIO_MAX}
                value={profile.bio ?? ""}
                placeholder="Your approach, areas of focus, and what patients can expect."
                onChange={(e) => set({ bio: e.target.value })}
              />
              <small className="gx-counter">{(profile.bio ?? "").length}/{BIO_MAX}</small>
            </label>
          </fieldset>

          <div className={`gx-form-footer${dirty ? " is-dirty" : ""}`}>
            <span className="gx-muted">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            <span className="pf-footer-actions">
              {dirty && (
                <button
                  className="gx-btn gx-btn-ghost"
                  type="button"
                  disabled={saving}
                  onClick={() => saved.current && loadInto(saved.current)}
                >
                  <RotateCcw size={16} /> Discard
                </button>
              )}
              <button className="gx-btn gx-btn-primary" type="submit" disabled={saving || !dirty}>
                {saving ? <Loader2 className="spin-icon" size={16} /> : <Save size={16} />}
                Save profile
              </button>
            </span>
          </div>
        </form>

        <aside className="gx-profile-preview" aria-label="Profile summary">
          <div className="pf-complete-side">{completeness}</div>
          <Card className="gx-doctor-card" title="How patients see you">
            <div className="gx-doctor-card-top">
              <DoctorAvatar name={profile.name || "Doctor"} url={profile.avatarUrl} className="doc-photo-lg" />
              <div>
                <h3>{profile.name || "Your name"}</h3>
                <p>{profile.specialty || "Specialty"}</p>
                <span className="gx-inline-meta">
                  <Star size={13} className="gx-star" />{" "}
                  {profile.ratingCount && profile.rating ? `${profile.rating.toFixed(1)} (${profile.ratingCount})` : "New"}
                  {profile.totalConsultations ? ` · ${profile.totalConsultations} consultations` : ""}
                </span>
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
                <strong>{formatMoney(profile.pricePerSession)}</strong> / session
              </span>
              <span className={`gx-avail-pill ${profile.isAvailable ? "is-on" : ""}`}>
                {profile.isAvailable ? "Available" : "Paused"}
              </span>
            </div>
          </Card>
          <Card title="Two-step sign-in">
            <TwoStepSettings />
          </Card>
        </aside>
      </div>
    </div>
  );
};

const LANGUAGE_SUGGESTIONS = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Odia"];

/** Typed values become chips: Enter or comma adds, Backspace on empty removes the last. */
const TagInput: React.FC<{
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
}> = ({ id, values, onChange, placeholder, suggestions = [], max = 10 }) => {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (next.length < max && !next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  };
  const open = suggestions.filter(
    (sug) => !values.some((v) => v.toLowerCase() === sug.toLowerCase()) && (!text || sug.toLowerCase().startsWith(text.trim().toLowerCase()))
  );
  return (
    <div className="pf-tags">
      <div className="pf-tags-box" onClick={() => document.getElementById(id)?.focus()}>
        {values.map((v) => (
          <span className="pf-tag" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X size={12} />
            </button>
          </span>
        ))}
        {(
          <input
            id={id}
            value={text}
            disabled={values.length >= max}
            placeholder={values.length >= max ? `Up to ${max}` : placeholder}
            onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={() => add(text)}
          />
        )}
      </div>
      {open.length > 0 && values.length < max && (
        <div className="pf-suggest" aria-label="Suggestions">
          {open.slice(0, 6).map((sug) => (
            <button type="button" key={sug} onMouseDown={(e) => e.preventDefault()} onClick={() => add(sug)}>
              + {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** How complete the profile is, each missing item a link to its field. */
const Completeness: React.FC<{ items: { id: string; label: string; done: boolean }[] }> = ({ items }) => {
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const jump = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => el?.focus(), 300);
  };
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <section className="gx-card pf-complete" aria-label="Profile completeness">
      <div className="pf-complete-head">
        <div>
          <h2>{pct === 100 ? "Your profile is complete" : "Complete your profile"}</h2>
          <p>{pct === 100 ? "Patients see everything they need to choose you." : "Complete profiles get booked more often."}</p>
        </div>
        <span className={`pf-ring${pct === 100 ? " is-done" : ""}`} style={{ "--pf": `${pct}%` } as React.CSSProperties}>
          <span>{pct}%</span>
        </span>
      </div>
      <ul className="pf-checklist">
        {sorted.map((item) => (
          <li key={item.id} className={item.done ? "is-done" : ""}>
            {item.done ? (
              <span>
                <CheckCircle2 size={16} /> {item.label}
              </span>
            ) : (
              <button type="button" onClick={() => jump(item.id)}>
                <Circle size={16} /> Add {item.label.toLowerCase()}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
