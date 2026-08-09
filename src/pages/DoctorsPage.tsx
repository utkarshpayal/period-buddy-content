import React, { useEffect, useState } from "react";
import {
  Stethoscope,
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mail,
  RefreshCw,
  Power,
  Copy,
  X
} from "lucide-react";
import {
  AdminDoctor,
  inviteDoctor,
  listDoctorsForAdmin,
  resendInvite,
  updateDoctorByAdmin,
  deactivateDoctor,
  formatMoney
} from "../api/doctorApi";
import { useAppContext } from "../context/AppContext";

const emptyForm = {
  name: "",
  email: "",
  specialty: "Gynecologist",
  pricePerSession: "",
  currency: "INR",
  experience: "",
  hospital: "",
  languages: "",
  bio: ""
};

export const DoctorsPage: React.FC = () => {
  const { authSession } = useAppContext();
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDoctors(await listDoctorsForAdmin());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gynecologists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setInviteUrl(null);
    try {
      const result = await inviteDoctor({
        name: form.name.trim(),
        email: form.email.trim(),
        specialty: form.specialty.trim(),
        pricePerSession: Number(form.pricePerSession),
        currency: form.currency,
        experience: form.experience.trim() || undefined,
        hospital: form.hospital.trim() || undefined,
        bio: form.bio.trim() || undefined,
        languages: form.languages
          ? form.languages.split(",").map((l) => l.trim()).filter(Boolean)
          : undefined
      });
      setNotice(
        result.inviteEmailDelivered
          ? `Invitation emailed to ${form.email}.`
          : `Doctor created. Email delivery is not configured — share the invite link below.`
      );
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite this gynecologist.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (id: string) => {
    setNotice(null);
    setError(null);
    setInviteUrl(null);
    try {
      const result = await resendInvite(id);
      setNotice(
        result.inviteEmailDelivered
          ? "Invite email resent."
          : "Invite regenerated — email not configured, share the link below."
      );
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend invite.");
    }
  };

  const toggleAvailability = async (doc: AdminDoctor) => {
    try {
      await updateDoctorByAdmin(doc._id, { isAvailable: !doc.isAvailable });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update doctor.");
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm("Deactivate this gynecologist and disable their login?")) return;
    try {
      await deactivateDoctor(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate doctor.");
    }
  };

  const accountStatus = (doc: AdminDoctor) => {
    const u = typeof doc.userId === "object" ? doc.userId : undefined;
    if (!u) return { label: "No account", cls: "gy-pill-muted" };
    if (u.mustSetPassword) return { label: "Invite pending", cls: "gy-pill-warn" };
    if (u.isActive === false) return { label: "Deactivated", cls: "gy-pill-muted" };
    return { label: "Active", cls: "gy-pill-ok" };
  };

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Clinician Network</p>
          <h2>Gynecologists</h2>
          <p className="subtitle-text">
            Invite gynecologists, manage their availability, and oversee the consultation network.
          </p>
        </div>
        <div className="header-actions">
          <button className="gy-btn gy-btn-primary" onClick={() => setShowForm((s) => !s)} type="button">
            <UserPlus size={16} />
            Invite Gynecologist
          </button>
        </div>
      </header>

      {!authSession && (
        <div className="gy-alert gy-alert-warn">
          <AlertCircle size={16} />
          <span>Sign in as an admin to invite and manage gynecologists.</span>
        </div>
      )}

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
      {inviteUrl && (
        <div className="gy-alert gy-alert-info">
          <Mail size={16} />
          <span className="gy-invite-url">{inviteUrl}</span>
          <button
            className="gy-btn gy-btn-ghost"
            type="button"
            onClick={() => navigator.clipboard?.writeText(inviteUrl)}
          >
            <Copy size={14} /> Copy
          </button>
        </div>
      )}

      {showForm && (
        <section className="gy-card gy-form-card">
          <div className="gy-card-head">
            <h3>Invite a new gynecologist</h3>
            <button className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
              <X size={18} />
            </button>
          </div>
          <form className="gy-form-grid" onSubmit={handleInvite}>
            <label className="gy-field">
              <span>Full name *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Anjali Rao"
                required
              />
            </label>
            <label className="gy-field">
              <span>Email *</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="doctor@example.com"
                required
              />
            </label>
            <label className="gy-field">
              <span>Specialty *</span>
              <input
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                required
              />
            </label>
            <label className="gy-field">
              <span>Price / session *</span>
              <input
                type="number"
                min={0}
                value={form.pricePerSession}
                onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })}
                placeholder="800"
                required
              />
            </label>
            <label className="gy-field">
              <span>Currency</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </label>
            <label className="gy-field">
              <span>Experience</span>
              <input
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                placeholder="10 years"
              />
            </label>
            <label className="gy-field">
              <span>Hospital / Clinic</span>
              <input
                value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })}
              />
            </label>
            <label className="gy-field">
              <span>Languages (comma separated)</span>
              <input
                value={form.languages}
                onChange={(e) => setForm({ ...form, languages: e.target.value })}
                placeholder="English, Hindi"
              />
            </label>
            <label className="gy-field gy-field-full">
              <span>Bio</span>
              <textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Short professional bio shown to patients."
              />
            </label>
            <div className="gy-form-actions gy-field-full">
              <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="gy-btn gy-btn-primary" type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="spin-icon" size={16} /> : <Mail size={16} />}
                Send Invite
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading gynecologists…</p>
        </div>
      ) : doctors.length === 0 ? (
        <div className="gy-empty">
          <Stethoscope size={26} />
          <p>No gynecologists yet. Invite your first clinician to get started.</p>
        </div>
      ) : (
        <div className="gy-doc-grid">
          {doctors.map((doc) => {
            const status = accountStatus(doc);
            return (
              <article className="gy-card gy-doc-card" key={doc._id}>
                <div className="gy-doc-top">
                  <span className="gy-doc-avatar">{doc.avatarEmoji || "👩‍⚕️"}</span>
                  <div className="gy-doc-id">
                    <h4>{doc.name}</h4>
                    <p>{doc.specialty}</p>
                  </div>
                  <span className={`gy-pill ${status.cls}`}>{status.label}</span>
                </div>
                <dl className="gy-doc-meta">
                  <div>
                    <dt>Fee</dt>
                    <dd>{formatMoney(doc.pricePerSession, doc.currency)}</dd>
                  </div>
                  <div>
                    <dt>Experience</dt>
                    <dd>{doc.experience || "—"}</dd>
                  </div>
                  <div>
                    <dt>Sessions</dt>
                    <dd>{doc.totalConsultations ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Availability</dt>
                    <dd>{doc.isAvailable ? "Open" : "Paused"}</dd>
                  </div>
                </dl>
                <div className="gy-doc-actions">
                  <button className="gy-btn gy-btn-ghost" type="button" onClick={() => handleResend(doc._id)}>
                    <RefreshCw size={14} /> Resend invite
                  </button>
                  <button className="gy-btn gy-btn-ghost" type="button" onClick={() => toggleAvailability(doc)}>
                    <Power size={14} /> {doc.isAvailable ? "Pause" : "Resume"}
                  </button>
                  <button className="gy-btn gy-btn-danger" type="button" onClick={() => handleDeactivate(doc._id)}>
                    Deactivate
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
