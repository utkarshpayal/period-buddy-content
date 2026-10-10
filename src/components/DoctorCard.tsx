import React, { useEffect, useRef, useState } from "react";
import {
  Award,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  ImageOff,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  UserPlus,
  UserX
} from "lucide-react";
import { AdminDoctor, formatMoney } from "../api/doctorApi";
import { DoctorAvatar } from "./DoctorPhoto";

export type DoctorCardActions = {
  onToggleBookings: (doc: AdminDoctor) => void;
  onResendInvite: (doc: AdminDoctor) => void;
  onResetTwoStep: (doc: AdminDoctor) => void;
  onChangePhoto: (doc: AdminDoctor) => void;
  onRemovePhoto: (doc: AdminDoctor) => void;
  onDeactivate: (doc: AdminDoctor) => void;
  onReactivate: (doc: AdminDoctor) => void;
  onDelete: (doc: AdminDoctor) => void;
};

type Status = { key: "active" | "paused" | "pending" | "deactivated" | "none"; label: string; cls: string };

export function doctorStatus(doc: AdminDoctor): Status {
  const u = typeof doc.userId === "object" ? doc.userId : undefined;
  if (!u) return { key: "none", label: "No account", cls: "gy-pill-muted" };
  if (u.isActive === false) return { key: "deactivated", label: "Deactivated", cls: "gy-pill-danger" };
  if (u.mustSetPassword) return { key: "pending", label: "Invite pending", cls: "gy-pill-warn" };
  if (!doc.isAvailable) return { key: "paused", label: "Bookings paused", cls: "gy-pill-info" };
  return { key: "active", label: "Active", cls: "gy-pill-ok" };
}

function lastSeen(iso?: string): string {
  if (!iso) return "Never signed in";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Signed in today";
  if (days === 1) return "Signed in yesterday";
  if (days < 30) return `Signed in ${days} days ago`;
  return `Last sign-in ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** One gynecologist in the admin list: identity, key numbers, and every account action. */
export const DoctorCard: React.FC<{ doc: AdminDoctor; busy?: boolean; actions: DoctorCardActions }> = ({
  doc,
  busy,
  actions
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = doctorStatus(doc);
  const account = typeof doc.userId === "object" ? doc.userId : undefined;
  const deactivated = status.key === "deactivated";
  const rated = Boolean(doc.ratingCount && doc.rating);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const run = (fn: (d: AdminDoctor) => void) => () => {
    setMenuOpen(false);
    fn(doc);
  };

  // The one action that matters most right now; the rest live in the menu.
  const primary = deactivated
    ? { label: "Reactivate", icon: <RotateCcw size={15} />, onClick: run(actions.onReactivate) }
    : status.key === "pending"
      ? { label: "Resend invite", icon: <RefreshCw size={15} />, onClick: run(actions.onResendInvite) }
      : doc.isAvailable
        ? { label: "Pause bookings", icon: <Pause size={15} />, onClick: run(actions.onToggleBookings) }
        : { label: "Resume bookings", icon: <Play size={15} />, onClick: run(actions.onToggleBookings) };

  return (
    <article className={`gy-card gy-doc-card ${deactivated ? "is-deactivated" : ""}`}>
      <header className="gy-doc-head">
        <button
          className="gy-doc-photo-btn"
          type="button"
          onClick={() => actions.onChangePhoto(doc)}
          disabled={busy || deactivated}
          title={doc.avatarUrl ? "Change photo" : "Add photo"}
          aria-label={`${doc.avatarUrl ? "Change" : "Add"} photo for ${doc.name}`}
        >
          <DoctorAvatar name={doc.name} url={doc.avatarUrl} className="doc-photo-md" />
          {!deactivated && (
            <span className="gy-doc-photo-badge">{busy ? <Loader2 className="spin-icon" size={11} /> : <Camera size={11} />}</span>
          )}
        </button>
        <div className="gy-doc-id">
          <h4 title={doc.name}>{doc.name}</h4>
          <p title={doc.specialty}>{doc.specialty}</p>
          <span className={`gy-pill ${status.cls}`}>{status.label}</span>
        </div>
        <div className="gy-doc-menu" ref={menuRef}>
          <button
            className="gy-icon-btn"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${doc.name}`}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="gy-menu" role="menu">
              {!deactivated && (
                <>
                  <button role="menuitem" type="button" onClick={run(actions.onChangePhoto)}>
                    <Camera size={15} /> {doc.avatarUrl ? "Change photo" : "Add photo"}
                  </button>
                  {doc.avatarUrl && (
                    <button role="menuitem" type="button" onClick={run(actions.onRemovePhoto)}>
                      <ImageOff size={15} /> Remove photo
                    </button>
                  )}
                </>
              )}
              {doc.email && (
                <button role="menuitem" type="button" onClick={run(() => navigator.clipboard?.writeText(doc.email || ""))}>
                  <Copy size={15} /> Copy email
                </button>
              )}
              {status.key === "pending" && (
                <button role="menuitem" type="button" onClick={run(actions.onResendInvite)}>
                  <RefreshCw size={15} /> Resend invite
                </button>
              )}
              {/* Active doctors get this as the primary button; an invited one
                  still needs it (e.g. to pause before they first sign in). */}
              {status.key === "pending" && (
                <button role="menuitem" type="button" onClick={run(actions.onToggleBookings)}>
                  {doc.isAvailable ? <Pause size={15} /> : <Play size={15} />}{" "}
                  {doc.isAvailable ? "Pause bookings" : "Resume bookings"}
                </button>
              )}
              {account?.twoFactor?.totpEnabledAt && !deactivated && (
                <button role="menuitem" type="button" onClick={run(actions.onResetTwoStep)}>
                  <KeyRound size={15} /> Reset authenticator
                </button>
              )}
              <hr />
              {deactivated ? (
                <button role="menuitem" type="button" onClick={run(actions.onReactivate)}>
                  <RotateCcw size={15} /> Reactivate account
                </button>
              ) : (
                account && (
                  <button role="menuitem" type="button" className="is-warn" onClick={run(actions.onDeactivate)}>
                    <UserX size={15} /> Deactivate account
                  </button>
                )
              )}
              <button role="menuitem" type="button" className="is-danger" onClick={run(actions.onDelete)}>
                <Trash2 size={15} /> Delete permanently
              </button>
            </div>
          )}
        </div>
      </header>

      <ul className="gy-doc-contact">
        {doc.email && (
          <li title={doc.email}>
            <Mail size={14} /> <a href={`mailto:${doc.email}`}>{doc.email}</a>
          </li>
        )}
        {doc.hospital && (
          <li title={doc.hospital}>
            <Building2 size={14} /> {doc.hospital}
          </li>
        )}
        {doc.experience && (
          <li title={doc.experience}>
            <Award size={14} /> {doc.experience} experience
          </li>
        )}
        {doc.referredBy?.name && (
          <li title={`Referred by ${doc.referredBy.name}`}>
            <UserPlus size={14} /> Referred by {doc.referredBy.name}
          </li>
        )}
        {(doc.freeSessionsRemaining ?? 0) > 0 && (
          <li>
            <Gift size={14} /> {doc.freeSessionsRemaining} commission-free session{doc.freeSessionsRemaining === 1 ? "" : "s"} left
          </li>
        )}
        <li
          className="gy-doc-seen"
          title={account?.lastLogin ? `Last sign-in ${new Date(account.lastLogin).toLocaleString()}` : undefined}
        >
          {account?.isActive && !account.mustSetPassword && account.lastLogin ? <CheckCircle2 size={14} /> : <Clock size={14} />}
          {account ? lastSeen(account.lastLogin) : "No login account"}
        </li>
      </ul>

      <dl className="gy-doc-stats">
        <div>
          <dt>Fee</dt>
          <dd>{formatMoney(doc.pricePerSession)}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>
            {rated ? (
              <>
                <Star size={13} className="gy-doc-star" /> {doc.rating!.toFixed(1)}
                <small> ({doc.ratingCount})</small>
              </>
            ) : (
              <span className="gy-doc-muted">New</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd>{doc.totalConsultations ?? 0}</dd>
        </div>
      </dl>

      <footer className="gy-doc-foot">
        <button className="gy-btn gy-btn-ghost" type="button" onClick={primary.onClick} disabled={busy}>
          {primary.icon} {primary.label}
        </button>
      </footer>
    </article>
  );
};
