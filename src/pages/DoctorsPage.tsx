import React, { useEffect, useRef, useState } from "react";
import { Stethoscope, UserPlus, Loader2, AlertCircle, Mail, Copy, X, Search, Trash2 } from "lucide-react";
import { twoFactorApi } from "../api/authApi";
import {
  AdminDoctor,
  inviteDoctor,
  listDoctorsForAdminPage,
  resendInvite,
  updateDoctorByAdmin,
  deactivateDoctor,
  deleteDoctorAccount,
  reactivateDoctor,
  removeDoctorAvatar,
  uploadDoctorAvatar,
  isValidSessionFee,
  MAX_SESSION_FEE,
  MIN_SESSION_FEE,
  SESSION_FEE_ERROR
} from "../api/doctorApi";
import { PhotoPicker, photoFileError } from "../components/DoctorPhoto";
import { DoctorCard } from "../components/DoctorCard";
import { useAppContext } from "../context/AppContext";
import { useNoticeToast } from "../components/Toast";
import { Pagination, type PageInfo } from "../components/Pagination";

const emptyForm = {
  name: "",
  email: "",
  specialty: "Gynecologist",
  pricePerSession: "",
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
  useNoticeToast(notice, () => setNotice(null));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  // Photo chosen in the invite form; uploaded once the doctor exists.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Changing an existing doctor's photo from their card.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<AdminDoctor | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  // Card whose account action (pause, deactivate, reactivate…) is in flight.
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const withBusy = (fn: (doc: AdminDoctor) => Promise<void>) => async (doc: AdminDoctor) => {
    if (actionBusyId) return;
    setActionBusyId(doc._id);
    try {
      await fn(doc);
    } finally {
      setActionBusyId(null);
    }
  };
  // Permanent delete asks the admin to type the doctor's name first.
  const [deleteTarget, setDeleteTarget] = useState<AdminDoctor | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Server-side paging (20 per page) + search over name/specialty/email.
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // A new search always starts from page 1: the search term and the page
  // change in the same update, so the old page is never loaded for the new
  // search (and the stale-response guard below drops anything in flight).
  const onSearchChange = (value: string) => setSearch(value);

  useEffect(() => {
    const next = search.trim();
    if (next === debouncedSearch) return;
    const t = setTimeout(() => {
      setDebouncedSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Only the newest list request may update the page (search/page races).
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const load = async (targetPage = page) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const res = await listDoctorsForAdminPage({ page: targetPage, search: debouncedSearch });
      if (generation !== loadGeneration.current) return;
      if (res.doctors.length === 0 && targetPage > 1) {
        setPage(targetPage - 1);
        return;
      }
      setDoctors(res.doctors);
      setPagination(res.pagination);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      setError(err instanceof Error ? err.message : "Failed to load gynecologists.");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidSessionFee(Number(form.pricePerSession))) {
      setError(SESSION_FEE_ERROR);
      return;
    }
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
        experience: form.experience.trim() || undefined,
        hospital: form.hospital.trim() || undefined,
        bio: form.bio.trim() || undefined,
        languages: form.languages
          ? form.languages.split(",").map((l) => l.trim()).filter(Boolean)
          : undefined
      });
      let photoNote = "";
      if (photoFile && result.doctor?._id) {
        try {
          await uploadDoctorAvatar(result.doctor._id, photoFile);
        } catch {
          photoNote = " The photo didn't upload — add it from their card.";
        }
      }
      setNotice(
        (result.inviteEmailDelivered
          ? `Invitation emailed to ${form.email}.`
          : `Doctor created. Email delivery is not configured — share the invite link below.`) + photoNote
      );
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
      setForm(emptyForm);
      setPhotoFile(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite this gynecologist.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (doc: AdminDoctor) => {
    setNotice(null);
    setError(null);
    setInviteUrl(null);
    try {
      const result = await resendInvite(doc._id);
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

  const changePhoto = (doc: AdminDoctor) => {
    setPhotoTarget(doc);
    photoInputRef.current?.click();
  };

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const doc = photoTarget;
    if (!file || !doc) return;
    const problem = photoFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPhotoBusyId(doc._id);
    try {
      const updated = await uploadDoctorAvatar(doc._id, file);
      setDoctors((list) => list.map((d) => (d._id === doc._id ? { ...d, avatarUrl: updated.avatarUrl } : d)));
      setNotice(`Photo updated for ${doc.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setPhotoBusyId(null);
      setPhotoTarget(null);
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

  const handleResetTwoStep = async (doc: AdminDoctor) => {
    if (
      !window.confirm(
        `Reset ${doc.name}'s authenticator app? Do this only if they lost their phone and recovery codes. They'll sign in with emailed codes and can set up a new app.`
      )
    )
      return;
    setNotice(null);
    setError(null);
    try {
      await twoFactorApi.resetDoctor(doc._id);
      setNotice("Authenticator app reset.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the authenticator app.");
    }
  };

  const handleDeactivate = async (doc: AdminDoctor) => {
    if (
      !window.confirm(
        `Deactivate ${doc.name}? Their login stops working, they're hidden from booking, and open consultations are cancelled (patients are told). You can reactivate them later.`
      )
    )
      return;
    setNotice(null);
    setError(null);
    try {
      await deactivateDoctor(doc._id);
      setNotice(`${doc.name} was deactivated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate doctor.");
    }
  };

  const handleReactivate = async (doc: AdminDoctor) => {
    setNotice(null);
    setError(null);
    try {
      const result = await reactivateDoctor(doc._id);
      setNotice(
        result.needsInvite
          ? `${doc.name} is active again. They never set a password, so resend their invite.`
          : `${doc.name} is active again. Bookings are paused until you resume them.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reactivate doctor.");
    }
  };

  const handleRemovePhoto = async (doc: AdminDoctor) => {
    if (!window.confirm(`Remove ${doc.name}'s profile photo?`)) return;
    setError(null);
    setPhotoBusyId(doc._id);
    try {
      await removeDoctorAvatar(doc._id);
      setDoctors((list) => list.map((d) => (d._id === doc._id ? { ...d, avatarUrl: null } : d)));
      setNotice(`Photo removed for ${doc.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setPhotoBusyId(null);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirm("");
  };

  const handleDelete = async () => {
    const doc = deleteTarget;
    if (!doc || deleteConfirm.trim() !== doc.name.trim()) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteDoctorAccount(doc._id);
      setNotice(`${doc.name} was deleted.`);
      setDeleteTarget(null);
      setDeleteConfirm("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete doctor.");
      setDeleteTarget(null);
      setDeleteConfirm("");
    } finally {
      setDeleting(false);
    }
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
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
        <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="gy-card-head">
            <h3>Invite a new gynecologist</h3>
            <button className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
              <X size={18} />
            </button>
          </div>
          <form className="gy-form-grid" onSubmit={handleInvite}>
            <div className="gy-field gy-field-full">
              <span>Profile photo</span>
              <PhotoPicker
                name={form.name || "Doctor"}
                url={photoPreview}
                hint="Shown to patients in the app. JPG, PNG or WebP, up to 5 MB."
                avatarClassName="doc-photo-lg"
                onPick={setPhotoFile}
                onRemove={() => setPhotoFile(null)}
                onError={setError}
              />
            </div>
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
              <span>Session fee (₹ INR) *</span>
              <input
                type="number"
                min={MIN_SESSION_FEE}
                max={MAX_SESSION_FEE}
                step="any"
                inputMode="decimal"
                aria-label="Session fee in Indian rupees"
                value={form.pricePerSession}
                onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })}
                placeholder="800"
                required
              />
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
        </div>
      )}

      <div className="app-filter-bar">
        <label className="scheme-search app-filter-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, specialty, or email…"
            aria-label="Search gynecologists"
          />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading gynecologists…</p>
        </div>
      ) : doctors.length === 0 ? (
        <div className="gy-empty">
          <Stethoscope size={26} />
          <p>
            {debouncedSearch
              ? `No gynecologists match “${debouncedSearch}”.`
              : "No gynecologists yet. Invite your first clinician to get started."}
          </p>
        </div>
      ) : (
        <div className="gy-doc-grid">
          {doctors.map((doc) => (
            <DoctorCard
              key={doc._id}
              doc={doc}
              busy={photoBusyId === doc._id || actionBusyId === doc._id}
              actions={{
                onToggleBookings: withBusy(toggleAvailability),
                onResendInvite: withBusy(handleResend),
                onResetTwoStep: withBusy(handleResetTwoStep),
                onChangePhoto: changePhoto,
                onRemovePhoto: handleRemovePhoto,
                onDeactivate: withBusy(handleDeactivate),
                onReactivate: withBusy(handleReactivate),
                onDelete: (d) => {
                  setDeleteConfirm("");
                  setDeleteTarget(d);
                }
              }}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={closeDelete}>
          <section
            className="gy-card gy-modal-panel gy-delete-panel"
            role="alertdialog"
            aria-labelledby="delete-doctor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gy-card-head">
              <h3 id="delete-doctor-title">Delete {deleteTarget.name}?</h3>
              <button className="gy-icon-btn" onClick={closeDelete} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="gy-delete-lead">This can't be undone. It will:</p>
            <ul className="gy-delete-list">
              <li>Delete their login account and sign them out everywhere</li>
              <li>Remove them from booking and cancel open consultations (patients are told; paid ones are flagged for refund)</li>
              <li>Hide their reels and remove their profile photo</li>
            </ul>
            <p className="gy-delete-note">
              Past consultations and earnings stay for your records. Deleting is blocked while their wallet still holds money or a payout is open. To pause them instead, use Deactivate.
            </p>
            <label className="gy-field">
              <span>
                Type <strong>{deleteTarget.name}</strong> to confirm
              </span>
              <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoFocus />
            </label>
            <div className="gy-form-actions">
              <button className="gy-btn gy-btn-ghost" type="button" onClick={closeDelete} disabled={deleting}>
                Cancel
              </button>
              <button
                className="gy-btn gy-btn-danger"
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirm.trim() !== deleteTarget.name.trim()}
              >
                {deleting ? <Loader2 className="spin-icon" size={16} /> : <Trash2 size={16} />}
                Delete permanently
              </button>
            </div>
          </section>
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoChosen} />

      <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="gynecologists" />
    </div>
  );
};
