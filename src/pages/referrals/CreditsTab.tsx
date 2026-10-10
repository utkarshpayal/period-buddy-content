import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Gift, Loader2, Plus, RefreshCw, Ticket, XCircle } from "lucide-react";
import { CREDIT_STATE, ReferralCredit, grantBonusSessions, listCredits, revokeCredit } from "../../api/referralApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Notice, Pill, Segmented, useLatestRequest } from "../../components/financeUi";
import { GynacPicker } from "../../components/GynacPicker";
import { ErrorAlert, Loading, dateTime, errorText, inr } from "../clinicalFinance/shared";
import { Initials, SessionMeter } from "./referralUi";

type Filter = "active" | "revoked" | "expired" | "";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "", label: "All" }
];

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Commission-free session credits: one per successful referral, plus any
 * bonus a Clinical Admin grants. Revoking takes back only the unused
 * sessions; the ones already used stay free.
 */
export const CreditsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.REFERRALS_MANAGE);
  const toast = useToast();

  const [status, setStatus] = useState<Filter>("active");
  const [doctorId, setDoctorId] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReferralCredit[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<ReferralCredit | null>(null);
  const list = useLatestRequest();

  const load = useCallback(async () => {
    const token = list.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await listCredits({ page, status, doctorId });
      if (!list.isLatest(token)) return;
      setRows(result.credits);
      setPagination(result.pagination);
    } catch (err) {
      if (list.isLatest(token)) setError(errorText(err, "Could not load free sessions."));
    } finally {
      if (list.isLatest(token)) setLoading(false);
    }
  }, [page, status, doctorId, list]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = (message: string) => {
    toast.success(message);
    setGranting(false);
    setRevoking(null);
    load();
    onChanged();
  };

  return (
    <div className="cf-stack">
      <Notice tone="info">
        Each free session waives Nura's commission on one paid consultation booked after the credit was given. A session cancelled before it
        happens is given back automatically.
      </Notice>

      <div className="rf-toolbar">
        <Segmented
          label="Credit status"
          items={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <div className="rf-toolbar-actions">
          <div className="rf-toolbar-picker">
            <GynacPicker
              value={doctorId}
              includeInactive
              placeholder="All gynecologists"
              onChange={(id) => {
                setDoctorId(id);
                setPage(1);
              }}
            />
          </div>
          <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} /> Refresh
          </button>
          {canManage && (
            <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => setGranting(true)}>
              <Plus size={14} /> Grant free sessions
            </button>
          )}
        </div>
      </div>

      <ErrorAlert message={error} />

      <div className="cf-table-card">
        {loading && rows.length === 0 ? (
          <Loading label="Loading free sessions…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<Ticket size={22} />} title="No free sessions here">
            Credits appear when a referred gynac joins, or when you grant some.
          </EmptyRow>
        ) : (
          <div className="cf-table-scroll rf-scroll rf-table-scroll" tabIndex={0}>
            <table className="cf-table is-wide rf-table">
              <thead>
                <tr>
                  <th>Gynecologist</th>
                  <th>From</th>
                  <th>Used</th>
                  <th className="num">Left</th>
                  <th>Status</th>
                  <th>Given / expires</th>
                  <th className="num">Commission waived</th>
                  {canManage && <th className="actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const meta = CREDIT_STATE[c.state];
                  const open = expanded === c._id;
                  return (
                    <React.Fragment key={c._id}>
                      <tr>
                        <td data-label="Gynecologist">
                          <div className="rf-person">
                            <Initials name={c.doctor?.name} />
                            <div>
                              <div className="cf-cell-title">{c.doctor?.name ?? "Removed gynac"}</div>
                              {c.doctor?.email && <div className="cf-cell-sub">{c.doctor.email}</div>}
                            </div>
                          </div>
                        </td>
                        <td data-label="From">
                          {c.kind === "referral" ? (
                            <>
                              <div>Referral</div>
                              {c.referredName && <div className="cf-cell-sub">{c.referredName} joined</div>}
                            </>
                          ) : (
                            <>
                              <div>Bonus</div>
                              {c.reason && <div className="cf-cell-sub">{c.reason}</div>}
                            </>
                          )}
                        </td>
                        <td data-label="Used">
                          <div className="rf-usage-cell">
                            <SessionMeter used={c.sessionsUsed} total={c.sessionsGranted} />
                            {c.usages.length > 0 ? (
                              <button type="button" className="rf-link" onClick={() => setExpanded(open ? null : c._id)} aria-expanded={open}>
                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {c.sessionsUsed} of {c.sessionsGranted} used
                              </button>
                            ) : (
                              <span className="cf-cell-sub">{c.sessionsUsed} of {c.sessionsGranted} used</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Left" className="num cf-cell-title">{c.sessionsRemaining}</td>
                        <td data-label="Status">
                          <Pill tone={meta.tone}>{meta.label}</Pill>
                          {c.state === "revoked" && (
                            <div className="cf-cell-sub">
                              {c.sessionsRevoked} taken back{c.revokeReason ? ` · ${c.revokeReason}` : ""}
                            </div>
                          )}
                        </td>
                        <td data-label="Given / expires">
                          <div className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{shortDate(c.grantedAt)}</div>
                          <div className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{c.expiresAt ? `Expires ${shortDate(c.expiresAt)}` : "Never expires"}</div>
                        </td>
                        <td data-label="Commission waived" className="num">{inr(c.commissionSaved)}</td>
                        {canManage && (
                          <td className="actions">
                            <div>
                              {c.state === "active" && (
                                <button type="button" className="cf-btn cf-btn-danger cf-btn-sm" onClick={() => setRevoking(c)}>
                                  <XCircle size={14} /> Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="rf-usages-row">
                          <td colSpan={canManage ? 8 : 7}>
                            <ul className="rf-usages">
                              {c.usages.map((u) => (
                                <li key={u.consultationId}>
                                  <span>Session {u.consultationId.slice(-6).toUpperCase()}</span>
                                  <span>{dateTime(u.usedAt)}</span>
                                  <span>{inr(u.commissionSaved)} waived</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-table-foot">
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="credits" />}
        </div>
      </div>

      {granting && <GrantDialog defaultDoctorId={doctorId} onClose={() => setGranting(false)} onDone={() => changed("Free sessions granted.")} />}
      {revoking && <RevokeDialog credit={revoking} onClose={() => setRevoking(null)} onDone={() => changed("Credit revoked.")} />}
    </div>
  );
};

const GrantDialog: React.FC<{ defaultDoctorId: string; onClose: () => void; onDone: () => void }> = ({ defaultDoctorId, onClose, onDone }) => {
  const toast = useToast();
  const [doctorId, setDoctorId] = useState(defaultDoctorId);
  const [sessions, setSessions] = useState("5");
  const [expiryDays, setExpiryDays] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = Number(sessions);
    if (!doctorId) return toast.error("Choose a gynecologist.");
    if (!Number.isInteger(n) || n < 1 || n > 50) return toast.error("Sessions must be 1 to 50.");
    const days = expiryDays.trim() ? Number(expiryDays) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) return toast.error("Expiry must be 1 to 3650 days, or empty.");
    if (reason.trim().length < 3) return toast.error("Give a reason.");
    setBusy(true);
    try {
      await grantBonusSessions({ doctorId, sessions: n, reason: reason.trim(), expiryDays: days });
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Could not grant the sessions."));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Grant free sessions"
      subtitle="Sessions with no Nura commission, on top of any the gynac already has."
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Gift size={16} />} Grant
          </button>
        </>
      }
    >
      <div className="cf-form-grid">
        <Field label="Gynecologist" full htmlFor="rf-g-doc">
          <GynacPicker id="rf-g-doc" value={doctorId} onChange={(id) => setDoctorId(id)} />
        </Field>
        <Field label="Sessions" htmlFor="rf-g-n">
          <input id="rf-g-n" type="number" inputMode="numeric" min={1} max={50} value={sessions} onChange={(e) => setSessions(e.target.value)} />
        </Field>
        <Field label="Expires after (days)" hint="Empty = never" htmlFor="rf-g-exp">
          <input id="rf-g-exp" type="number" inputMode="numeric" min={1} max={3650} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
        </Field>
        <Field label="Reason" full hint="Kept in the audit log and shown on the credit." htmlFor="rf-g-reason">
          <input id="rf-g-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Referral made before the program launched" />
        </Field>
      </div>
    </Modal>
  );
};

const RevokeDialog: React.FC<{ credit: ReferralCredit; onClose: () => void; onDone: () => void }> = ({ credit, onClose, onDone }) => {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < 3) return toast.error("Give a reason.");
    setBusy(true);
    try {
      await revokeCredit(credit._id, reason.trim());
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Could not revoke the credit."));
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Revoke ${credit.sessionsRemaining} free session${credit.sessionsRemaining === 1 ? "" : "s"}`}
      subtitle={credit.doctor?.name}
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Back</button>
          <button className="cf-btn cf-btn-danger" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />} Revoke
          </button>
        </>
      }
    >
      <Notice tone="warn">
        The {credit.sessionsUsed} session{credit.sessionsUsed === 1 ? "" : "s"} already used stay commission-free. This can't be undone; grant new
        sessions instead if needed.
      </Notice>
      <Field label="Reason" htmlFor="rf-rv-reason">
        <textarea id="rf-rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
      </Field>
    </Modal>
  );
};
