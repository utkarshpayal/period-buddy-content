import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Gift,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Repeat,
  Send,
  UserPlus,
  X,
  XCircle
} from "lucide-react";
import {
  REFERRAL_STATUS,
  Referral,
  ReferralStatus,
  approveReferral,
  cancelReferral,
  createReferral,
  listReferrals,
  reassignReferrer,
  rejectReferral
} from "../../api/referralApi";
import { MAX_SESSION_FEE, MIN_SESSION_FEE, SESSION_FEE_ERROR, isValidSessionFee } from "../../api/doctorApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Notice, Pill, SearchField, Segmented, useLatestRequest } from "../../components/financeUi";
import { GynacPicker, isInvitePending } from "../../components/GynacPicker";
import { ErrorAlert, Loading, dateTime, errorText } from "../clinicalFinance/shared";
import { Initials, ReferralStepper, relativeDay } from "./referralUi";

type Filter = ReferralStatus | "";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "", label: "All" },
  { value: "invited", label: "Invited" },
  { value: "onboarded", label: "Joined" },
  { value: "cancelled", label: "Closed" }
];
// Offline leads an admin logged wait for approval; the filter only shows when there are some.
const REVIEW_FILTER: { value: Filter; label: string } = { value: "submitted", label: "To review" };
const REJECTED_FILTER: { value: Filter; label: string } = { value: "rejected", label: "Rejected" };

type DialogKind = "approve" | "reject" | "cancel" | "reassign";
type Dialog = { kind: DialogKind; referral: Referral } | { kind: "record" } | null;

const EMPTY_TEXT: Record<Filter, { title: string; body: string }> = {
  submitted: { title: "Nothing to review", body: "Offline referrals you record land here until you approve them." },
  invited: { title: "No open invites", body: "Referrals you approve wait here until the colleague joins." },
  onboarded: { title: "No one has joined yet", body: "Referred gynacs who set up their account show up here." },
  rejected: { title: "No rejected referrals", body: "Referrals you turn down are kept here for reference." },
  withdrawn: { title: "Nothing withdrawn", body: "" },
  cancelled: { title: "Nothing closed", body: "Referrals you close, or whose gynac was deactivated before joining, show up here." },
  "": { title: "No referrals yet", body: "Referrals gynacs send from their portal show up here." }
};

/**
 * Every referral, newest first, with where each one stands. A row opens the
 * full story and its actions; "To review" rows also get Approve / Reject
 * inline. The status filter is owned by the page so its KPI cards can set it.
 */
export const ReferralsTab: React.FC<{
  status: Filter;
  onStatusChange: (status: Filter) => void;
  onChanged: () => void;
  /** Admin-logged leads waiting for approval. */
  pendingLeads: number;
}> = ({ status, onStatusChange, onChanged, pendingLeads }) => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.REFERRALS_MANAGE);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Referral[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Referral | null>(null);
  const [inviteLink, setInviteLink] = useState<{ url: string; name: string } | null>(null);
  const list = useLatestRequest();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status]);

  const load = useCallback(async () => {
    const token = list.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await listReferrals({ page, status, search: debounced });
      if (!list.isLatest(token)) return;
      setRows(result.referrals);
      setPagination(result.pagination);
    } catch (err) {
      if (list.isLatest(token)) setError(errorText(err, "Could not load referrals."));
    } finally {
      if (list.isLatest(token)) setLoading(false);
    }
  }, [page, status, debounced, list]);

  useEffect(() => {
    load();
  }, [load]);

  const done = (message: string) => {
    toast.success(message);
    setDialog(null);
    setSelected(null);
    load();
    onChanged();
  };

  const open = (kind: DialogKind, referral: Referral) => setDialog({ kind, referral });
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success("Copied."), () => undefined);
  const empty = EMPTY_TEXT[status] ?? EMPTY_TEXT[""];

  return (
    <div className="cf-stack">
      <div className="rf-toolbar">
        <Segmented
          label="Referral status"
          items={[
            ...FILTERS,
            ...(pendingLeads || status === "submitted" ? [{ ...REVIEW_FILTER, count: pendingLeads }] : []),
            ...(status === "rejected" ? [REJECTED_FILTER] : [])
          ]}
          value={status}
          onChange={onStatusChange}
        />
        <div className="rf-toolbar-actions">
          <SearchField value={search} onChange={setSearch} placeholder="Search colleague or referrer" />
          <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
            <span className="rf-hide-sm">Refresh</span>
          </button>
          {canManage && (
            <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => setDialog({ kind: "record" })}>
              <Plus size={14} /> Record referral
            </button>
          )}
        </div>
      </div>

      {inviteLink && (
        <Notice
          tone="info"
          action={
            <span style={{ display: "inline-flex", gap: 6 }}>
              <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => copy(inviteLink.url)}>
                <Copy size={14} /> Copy link
              </button>
              <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => setInviteLink(null)}>
                Done
              </button>
            </span>
          }
        >
          Email isn't configured, so share {inviteLink.name}'s invite link yourself.
        </Notice>
      )}

      <ErrorAlert message={error} />

      <div className={`cf-table-card ${loading && rows.length ? "rf-is-refreshing" : ""}`}>
        {loading && rows.length === 0 ? (
          <Loading label="Loading referrals…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<UserPlus size={22} />} title={debounced ? "No matches" : empty.title}>
            {debounced ? `Nothing matches “${debounced}”.` : empty.body}
          </EmptyRow>
        ) : (
          <div className="cf-table-scroll rf-scroll rf-table-scroll" tabIndex={0}>
            <table className="cf-table is-wide rf-table">
              <thead>
                <tr>
                  <th>Referred colleague</th>
                  <th>Referred by</th>
                  <th>Progress</th>
                  <th>Updated</th>
                  <th className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = REFERRAL_STATUS[r.status];
                  return (
                    <tr
                      key={r._id}
                      className="rf-row"
                      tabIndex={0}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(r);
                        }
                      }}
                      aria-label={`Open referral of ${r.referredName}`}
                    >
                      <td data-label="Referred colleague">
                        <div className="rf-person">
                          <Initials name={r.referredName} />
                          <div>
                            <div className="cf-cell-title">{r.referredName}</div>
                            <div className="cf-cell-sub">{r.referredEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Referred by">
                        <div className="cf-cell-title">{r.referrer?.name ?? "Removed gynac"}</div>
                        <div className="cf-cell-sub">{r.source === "admin" ? "Recorded by the team" : "From their portal"}</div>
                      </td>
                      <td data-label="Progress">
                        <div className="rf-progress-cell">
                          <ReferralStepper referral={r} compact />
                          <Pill tone={meta.tone}>
                            {r.status === "onboarded" && r.rewardStatus === "granted"
                              ? `Joined · ${r.rewardSessions} sessions given`
                              : r.status === "onboarded" && r.rewardStatus === "pending"
                                ? "Joined · reward after 1st session"
                                : meta.label}
                          </Pill>
                        </div>
                      </td>
                      <td data-label="Updated" className="cf-cell-sub" style={{ whiteSpace: "nowrap" }} title={dateTime(r.onboardedAt || r.invitedAt || r.createdAt)}>
                        {relativeDay(r.onboardedAt || r.reviewedAt || r.createdAt)}
                      </td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <div>
                          {canManage && r.status === "submitted" && (
                            <>
                              <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => open("approve", r)}>
                                <Send size={14} /> Approve
                              </button>
                              <button type="button" className="cf-icon-btn rf-icon-danger" onClick={() => open("reject", r)} title="Reject" aria-label={`Reject referral of ${r.referredName}`}>
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          <button type="button" className="cf-icon-btn" onClick={() => setSelected(r)} title="Details" aria-label={`Details for ${r.referredName}`}>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-table-foot">
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="referrals" />}
        </div>
      </div>

      {selected && (
        <ReferralDrawer
          referral={selected}
          canManage={canManage}
          blocked={dialog !== null}
          onClose={() => setSelected(null)}
          onAction={(kind) => open(kind, selected)}
        />
      )}

      {dialog?.kind === "approve" && (
        <ApproveDialog
          referral={dialog.referral}
          onClose={() => setDialog(null)}
          onDone={(url, delivered) => {
            if (!delivered && url) setInviteLink({ url, name: dialog.referral.referredName });
            done(delivered ? `Invite emailed to ${dialog.referral.referredEmail}.` : "Gynac invited.");
          }}
        />
      )}
      {(dialog?.kind === "reject" || dialog?.kind === "cancel") && (
        <ReasonDialog
          kind={dialog.kind}
          referral={dialog.referral}
          onClose={() => setDialog(null)}
          onDone={() => done(dialog.kind === "reject" ? "Referral rejected. The gynac has been told." : "Referral closed.")}
        />
      )}
      {dialog?.kind === "reassign" && (
        <ReassignDialog referral={dialog.referral} onClose={() => setDialog(null)} onDone={() => done("Referrer changed.")} />
      )}
      {dialog?.kind === "record" && <RecordDialog onClose={() => setDialog(null)} onDone={() => done("Referral recorded.")} />}
    </div>
  );
};

/* ------------------------------ Drawer ------------------------------ */

type TimelineItem = { at?: string; title: string; detail?: string; tone: "done" | "stop" | "next" };

const timelineOf = (r: Referral): TimelineItem[] => {
  const items: TimelineItem[] = [
    {
      at: r.createdAt,
      title: r.source === "admin" ? "Recorded by the clinical team" : `Referred by ${r.referrer?.name ?? "a gynac"}`,
      detail: r.note ? `“${r.note}”` : undefined,
      tone: "done"
    }
  ];
  if (r.status === "rejected") items.push({ at: r.reviewedAt, title: "Rejected", detail: r.closeReason, tone: "stop" });
  if (r.status === "withdrawn") items.push({ at: r.reviewedAt ?? undefined, title: "Withdrawn by the referrer", tone: "stop" });
  if (r.invitedAt) items.push({ at: r.invitedAt, title: "Invite sent", detail: `To ${r.referredEmail}`, tone: "done" });
  if (r.status === "cancelled") items.push({ at: r.reviewedAt, title: "Closed without a reward", detail: r.closeReason, tone: "stop" });
  if (r.onboardedAt) items.push({ at: r.onboardedAt, title: "Joined Nura", detail: "Set up their account", tone: "done" });
  if (r.rewardStatus === "granted") {
    items.push({ at: r.onboardedAt, title: `${r.rewardSessions} free sessions given`, detail: `To ${r.referrer?.name ?? "the referrer"}`, tone: "done" });
  }
  if (r.rewardStatus === "skipped") items.push({ at: r.onboardedAt, title: "No reward", detail: r.rewardSkipReason, tone: "stop" });
  if (r.status === "submitted") items.push({ title: "Waiting for review", detail: "Approve to send the invite", tone: "next" });
  if (r.status === "invited") items.push({ title: "Waiting for them to join", detail: "The reward is given automatically", tone: "next" });
  if (r.status === "onboarded" && r.rewardStatus === "pending") {
    items.push({ title: "Waiting for their first session", detail: "The reward is given after their first completed paid consultation", tone: "next" });
  }
  return items;
};

/** Everything about one referral, and what can be done with it. */
const ReferralDrawer: React.FC<{
  referral: Referral;
  canManage: boolean;
  /** A dialog is open on top: it owns Escape and the focus. */
  blocked: boolean;
  onClose: () => void;
  onAction: (kind: DialogKind) => void;
}> = ({ referral: r, canManage, blocked, onClose, onAction }) => {
  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Focus moves in on open and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the panel.
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, blocked]);
  const meta = REFERRAL_STATUS[r.status];
  const openStatus = r.status === "submitted" || r.status === "invited";

  return (
    <div className="rf-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="rf-drawer" ref={panel} role="dialog" aria-modal="true" aria-label={`Referral of ${r.referredName}`}>
        <header className="rf-drawer-head">
          <div className="rf-person">
            <Initials name={r.referredName} size="md" />
            <div>
              <h3>{r.referredName}</h3>
              <Pill tone={meta.tone}>{meta.label}</Pill>
            </div>
          </div>
          <button type="button" className="cf-icon-btn" ref={closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="rf-drawer-body">
          <ReferralStepper referral={r} />

          <dl className="rf-facts">
            <div>
              <dt><Mail size={14} /> Email</dt>
              <dd>{r.referredEmail}</dd>
            </div>
            {r.referredPhone && (
              <div>
                <dt><Phone size={14} /> Phone</dt>
                <dd>{r.referredPhone}</dd>
              </div>
            )}
            <div>
              <dt><UserPlus size={14} /> Referred by</dt>
              <dd>
                {r.referrer?.name ?? "Removed gynac"}
                {r.referrer?.email && <span className="cf-cell-sub">{r.referrer.email}</span>}
              </dd>
            </div>
            <div>
              <dt><Gift size={14} /> Reward</dt>
              <dd>
                {r.rewardStatus === "granted"
                  ? `${r.rewardSessions} commission-free sessions given`
                  : r.rewardStatus === "skipped"
                    ? "Not given"
                    : r.status === "onboarded"
                      ? "Given after their first completed consultation"
                      : openStatus
                      ? "Given when they join"
                      : "None"}
              </dd>
            </div>
          </dl>

          <h4 className="rf-drawer-title">Timeline</h4>
          <ol className="rf-timeline">
            {timelineOf(r).map((item, i) => (
              <li key={i} className={`is-${item.tone}`}>
                <span className="rf-timeline-dot" aria-hidden>
                  {item.tone === "done" ? <CheckCircle2 size={14} /> : item.tone === "stop" ? <XCircle size={14} /> : <Clock size={14} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  {item.detail && <span>{item.detail}</span>}
                  {item.at && <time dateTime={item.at}>{dateTime(item.at)}</time>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {canManage && openStatus && (
          <footer className="rf-drawer-foot">
            {r.status === "submitted" && (
              <button type="button" className="cf-btn cf-btn-primary" onClick={() => onAction("approve")}>
                <Send size={16} /> Approve &amp; invite
              </button>
            )}
            <button type="button" className="cf-btn cf-btn-secondary" onClick={() => onAction("reassign")}>
              <Repeat size={16} /> Change referrer
            </button>
            {r.status === "submitted" ? (
              <button type="button" className="cf-btn cf-btn-danger" onClick={() => onAction("reject")}>
                <XCircle size={16} /> Reject
              </button>
            ) : (
              <button type="button" className="cf-btn cf-btn-danger" onClick={() => onAction("cancel")}>
                <Ban size={16} /> Close
              </button>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
};

/* ------------------------------ Dialogs ------------------------------ */

const ApproveDialog: React.FC<{
  referral: Referral;
  onClose: () => void;
  onDone: (inviteUrl: string | undefined, delivered: boolean) => void;
}> = ({ referral, onClose, onDone }) => {
  const toast = useToast();
  const [form, setForm] = useState({
    name: referral.referredName,
    specialty: "Gynecologist",
    pricePerSession: "",
    experience: "",
    hospital: "",
    languages: ""
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (form.name.trim().length < 2 || !form.specialty.trim()) return toast.error("Name and specialty are required.");
    if (!isValidSessionFee(Number(form.pricePerSession))) return toast.error(SESSION_FEE_ERROR);
    setBusy(true);
    try {
      const result = await approveReferral(referral._id, {
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        pricePerSession: Number(form.pricePerSession),
        experience: form.experience.trim() || undefined,
        hospital: form.hospital.trim() || undefined,
        languages: form.languages ? form.languages.split(",").map((l) => l.trim()).filter(Boolean) : undefined
      });
      onDone(result.inviteUrl, result.inviteEmailDelivered);
    } catch (err) {
      toast.error(errorText(err, "Could not send the invite."));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Invite ${referral.referredName}`}
      subtitle={`Referred by ${referral.referrer?.name ?? "a gynac"} · invite goes to ${referral.referredEmail}`}
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      width={620}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send invite
          </button>
        </>
      }
    >
      {referral.note && <p className="cf-help">Note from the referrer: “{referral.note}”</p>}
      <div className="cf-form-grid">
        <Field label="Full name" htmlFor="rf-a-name">
          <input id="rf-a-name" value={form.name} onChange={set("name")} maxLength={120} autoFocus />
        </Field>
        <Field label="Specialty" htmlFor="rf-a-spec">
          <input id="rf-a-spec" value={form.specialty} onChange={set("specialty")} maxLength={80} />
        </Field>
        <Field label="Session fee (₹)" hint={`Between ₹${MIN_SESSION_FEE} and ₹${MAX_SESSION_FEE.toLocaleString("en-IN")}`} htmlFor="rf-a-fee">
          <input id="rf-a-fee" type="number" inputMode="numeric" min={MIN_SESSION_FEE} max={MAX_SESSION_FEE} value={form.pricePerSession} onChange={set("pricePerSession")} />
        </Field>
        <Field label="Experience (optional)" htmlFor="rf-a-exp">
          <input id="rf-a-exp" value={form.experience} onChange={set("experience")} placeholder="e.g. 8 years" />
        </Field>
        <Field label="Hospital / clinic (optional)" htmlFor="rf-a-hosp">
          <input id="rf-a-hosp" value={form.hospital} onChange={set("hospital")} />
        </Field>
        <Field label="Languages (optional)" hint="Comma separated" htmlFor="rf-a-lang">
          <input id="rf-a-lang" value={form.languages} onChange={set("languages")} placeholder="English, Hindi" />
        </Field>
      </div>
      <p className="cf-help">
        When {referral.referredName.split(" ")[0]} sets their password, {referral.referrer?.name ?? "the referrer"} gets their free sessions automatically.
      </p>
    </Modal>
  );
};

const ReasonDialog: React.FC<{ kind: "reject" | "cancel"; referral: Referral; onClose: () => void; onDone: () => void }> = ({
  kind,
  referral,
  onClose,
  onDone
}) => {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < 3) return toast.error("Give a short reason.");
    setBusy(true);
    try {
      await (kind === "reject" ? rejectReferral : cancelReferral)(referral._id, reason.trim());
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Could not update the referral."));
      setBusy(false);
    }
  };
  return (
    <Modal
      title={kind === "reject" ? `Reject referral of ${referral.referredName}` : `Close referral of ${referral.referredName}`}
      subtitle={`Referred by ${referral.referrer?.name ?? "a gynac"}`}
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Back</button>
          <button className="cf-btn cf-btn-danger" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />} {kind === "reject" ? "Reject" : "Close referral"}
          </button>
        </>
      }
    >
      {kind === "cancel" && (
        <Notice tone="warn">
          No reward will be given for this referral. The invite itself isn't withdrawn: deactivate the gynac from Gynecologists if they shouldn't join.
        </Notice>
      )}
      <Field label="Reason" hint={kind === "reject" ? "Emailed to the referring gynac." : "Shown to the referring gynac."} htmlFor="rf-reason">
        <textarea id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
      </Field>
    </Modal>
  );
};

const ReassignDialog: React.FC<{ referral: Referral; onClose: () => void; onDone: () => void }> = ({ referral, onClose, onDone }) => {
  const toast = useToast();
  const [referrerId, setReferrerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!referrerId) return toast.error("Choose who referred them.");
    setBusy(true);
    try {
      await reassignReferrer(referral._id, referrerId, reason.trim() || undefined);
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Could not change the referrer."));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Change who referred them"
      subtitle={`${referral.referredName} · currently ${referral.referrer?.name ?? "a removed gynac"}`}
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Save
          </button>
        </>
      }
    >
      <Field label="Referred by" hint="This gynac gets the free sessions when the colleague joins." htmlFor="rf-re-ref">
        <GynacPicker
          id="rf-re-ref"
          value={referrerId}
          onChange={(id) => setReferrerId(id)}
          exclude={[referral.referrer?._id, referral.referredDoctor?._id]}
        />
      </Field>
      <Field label="Reason (optional)" htmlFor="rf-re-reason">
        <input id="rf-re-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
};

/** Record a referral made offline: credit an invited gynac, or log a new lead. */
const RecordDialog: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const toast = useToast();
  const [mode, setMode] = useState<"existing" | "lead">("existing");
  const [referrerId, setReferrerId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [lead, setLead] = useState({ name: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const setL = (key: keyof typeof lead) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLead({ ...lead, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!referrerId) return toast.error("Choose the referring gynac.");
    if (mode === "existing" && !doctorId) return toast.error("Choose the gynac they referred.");
    if (mode === "lead" && (lead.name.trim().length < 2 || !lead.email.trim())) return toast.error("Enter the colleague's name and email.");
    setBusy(true);
    try {
      await createReferral(
        mode === "existing"
          ? { referrerDoctorId: referrerId, doctorId, note: lead.note.trim() || undefined }
          : {
              referrerDoctorId: referrerId,
              name: lead.name.trim(),
              email: lead.email.trim(),
              phone: lead.phone.trim() || undefined,
              note: lead.note.trim() || undefined
            }
      );
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Could not record the referral."));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record a referral"
      subtitle="For a colleague referred outside the portal, e.g. by phone."
      onClose={() => !busy && onClose()}
      onSubmit={submit}
      width={600}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Record
          </button>
        </>
      }
    >
      <Segmented
        label="Who was referred"
        items={[
          { value: "existing", label: "Already invited" },
          { value: "lead", label: "Not invited yet" }
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="cf-form-grid">
        <Field label="Referred by" full htmlFor="rf-rec-ref">
          <GynacPicker id="rf-rec-ref" value={referrerId} onChange={(id) => setReferrerId(id)} exclude={[doctorId]} />
        </Field>
        {mode === "existing" ? (
          <Field label="Gynac they referred" full hint="Only gynacs who were invited and haven't joined yet can be credited." htmlFor="rf-rec-doc">
            <GynacPicker
              id="rf-rec-doc"
              value={doctorId}
              onChange={(id) => setDoctorId(id)}
              filter={(d) => isInvitePending(d) && !d.referredBy}
              exclude={[referrerId]}
              placeholder="Choose an invited gynac"
            />
          </Field>
        ) : (
          <>
            <Field label="Colleague's name" htmlFor="rf-rec-name">
              <input id="rf-rec-name" value={lead.name} onChange={setL("name")} maxLength={120} />
            </Field>
            <Field label="Email" htmlFor="rf-rec-email">
              <input id="rf-rec-email" type="email" value={lead.email} onChange={setL("email")} maxLength={254} />
            </Field>
            <Field label="Phone (optional)" htmlFor="rf-rec-phone">
              <input id="rf-rec-phone" type="tel" value={lead.phone} onChange={setL("phone")} maxLength={20} />
            </Field>
          </>
        )}
        <Field label="Note (optional)" full htmlFor="rf-rec-note">
          <textarea id="rf-rec-note" value={lead.note} onChange={setL("note")} maxLength={500} />
        </Field>
      </div>
      {mode === "lead" && <p className="cf-help">It's added to “To review”, where you can approve it to send the invite.</p>}
    </Modal>
  );
};
