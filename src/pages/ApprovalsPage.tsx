import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  Undo2,
  X
} from "lucide-react";
import {
  ChangeRequest,
  ChangeRequestStatus,
  approveChangeRequest,
  cancelChangeRequest,
  listChangeRequests,
  personName,
  rejectChangeRequest
} from "../api/workspaceApi";
import type { Pagination } from "../api/adminApi";
import { DEPARTMENT_LABEL, Department, PERMISSIONS, roleLabel } from "../auth/access";
import { useAppContext } from "../context/AppContext";
import { useToast } from "../components/Toast";

type Scope = "review" | "mine";

const STATUS_TABS: Array<{ value: ChangeRequestStatus | "all"; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
];

const ACTION_LABEL: Record<string, string> = {
  update: "Edit",
  publish: "Visibility",
  delete: "Delete",
  create: "Create",
  push_send: "Push",
  user_status: "Account",
  pricing_change: "Pricing"
};

const STATUS_PILL: Record<ChangeRequestStatus, string> = {
  pending: "gy-pill-warn",
  approved: "gy-pill-ok",
  rejected: "gy-pill-danger",
  cancelled: "gy-pill-muted"
};

// Bookkeeping fields that only add noise to a diff.
const HIDDEN_FIELDS = new Set(["_id", "id", "__v", "createdAt", "updatedAt", "slug", "views", "likes", "createdBy"]);

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const show = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(show).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const humanize = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Rows of { field, current, proposed } for fields the request would change. */
function diffRows(req: ChangeRequest) {
  const body = req.body ?? {};
  const before = req.before ?? {};
  return Object.keys(body)
    .filter((k) => !HIDDEN_FIELDS.has(k))
    .map((k) => ({ field: humanize(k), current: show(before[k]), proposed: show(body[k]) }))
    .filter((row) => !req.before || row.current !== row.proposed);
}

export const ApprovalsPage: React.FC = () => {
  const { can, refreshApprovals, refreshContent, approvalSummary } = useAppContext();
  const toast = useToast();
  const isApprover = can(PERMISSIONS.CONTENT_APPROVE, PERMISSIONS.APP_APPROVE);

  const [scope, setScope] = useState<Scope>(isApprover ? "review" : "mine");
  const [status, setStatus] = useState<ChangeRequestStatus | "all">("pending");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listChangeRequests({ scope, status, page, limit: 20 });
      setRequests(res.requests);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, [scope, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [scope, status]);

  const afterDecision = async (updated: ChangeRequest, message: string) => {
    toast.success(message);
    setRequests((prev) =>
      status === "pending" ? prev.filter((r) => r._id !== updated._id) : prev.map((r) => (r._id === updated._id ? updated : r))
    );
    setExpanded(null);
    await refreshApprovals();
    if (updated.department === "content") refreshContent();
  };

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Approvals</h2>
          <p className="subtitle-text">
            {isApprover
              ? "Changes your team proposed wait here until you approve them. Approving applies the change immediately."
              : "Anything you submit for approval is tracked here, along with the reviewer's decision."}
          </p>
        </div>
      </div>

      <div className="ws-tabs" role="tablist">
        {isApprover && (
          <button role="tab" aria-selected={scope === "review"} className={scope === "review" ? "is-active" : ""} onClick={() => setScope("review")}>
            To review {approvalSummary.toReview > 0 && <span className="nav-badge is-alert">{approvalSummary.toReview}</span>}
          </button>
        )}
        <button role="tab" aria-selected={scope === "mine"} className={scope === "mine" ? "is-active" : ""} onClick={() => setScope("mine")}>
          My requests {approvalSummary.minePending > 0 && <span className="nav-badge">{approvalSummary.minePending}</span>}
        </button>
        <div className="ws-tabs-spacer" />
        <div className="ws-segmented" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((t) => (
            <button key={t.value} className={status === t.value ? "is-active" : ""} onClick={() => setStatus(t.value)} type="button">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading requests…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="ws-empty">
          <span className="ws-empty-icon"><Inbox size={26} /></span>
          <h3>{status === "pending" ? "You're all caught up" : "Nothing here yet"}</h3>
          <p>
            {scope === "review"
              ? "When a teammate submits a change that needs your sign-off, it shows up here."
              : "Publishing, deleting, wide pushes and pricing changes you make will appear here for tracking."}
          </p>
        </div>
      ) : (
        <div className="ws-request-list">
          {requests.map((r) => (
            <RequestCard
              key={r._id}
              request={r}
              scope={scope}
              open={expanded === r._id}
              onToggle={() => setExpanded((cur) => (cur === r._id ? null : r._id))}
              onDecided={afterDecision}
            />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="admin-pagination">
          <button type="button" className="gy-btn gy-btn-ghost" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="admin-page-indicator">Page {pagination.page} of {pagination.pages}</span>
          <button type="button" className="gy-btn gy-btn-ghost" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

const RequestCard: React.FC<{
  request: ChangeRequest;
  scope: Scope;
  open: boolean;
  onToggle: () => void;
  onDecided: (updated: ChangeRequest, message: string) => Promise<void>;
}> = ({ request: r, scope, open, onToggle, onDecided }) => {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "cancel" | null>(null);
  const rows = useMemo(() => (open ? diffRows(r) : []), [open, r]);
  const isPending = r.status === "pending";

  const act = async (kind: "approve" | "reject" | "cancel") => {
    if (kind === "reject" && !note.trim()) {
      toast.error("Add a short note so the requester knows what to change.");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "approve") await onDecided(await approveChangeRequest(r._id, note.trim() || undefined), "Approved and applied.");
      if (kind === "reject") await onDecided(await rejectChangeRequest(r._id, note.trim()), "Request rejected.");
      if (kind === "cancel") await onDecided(await cancelChangeRequest(r._id), "Request withdrawn.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`ws-request ${open ? "is-open" : ""}`}>
      <button type="button" className="ws-request-head" onClick={onToggle} aria-expanded={open}>
        <span className={`ws-action-chip action-${r.action}`}>{ACTION_LABEL[r.action] ?? r.action}</span>
        <div className="ws-request-title">
          <strong>{r.summary || `${r.action} ${r.resourceType ?? ""}`}</strong>
          <span>
            {scope === "review" ? `${personName(r.requestedBy)} · ${roleLabel(r.requesterRole)}` : DEPARTMENT_LABEL[r.department as Department] ?? r.department}
            {" · "}
            <Clock size={12} /> {timeAgo(r.createdAt)}
          </span>
        </div>
        <span className={`gy-pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
        <ChevronDown size={18} className="ws-chevron" />
      </button>

      {open && (
        <div className="ws-request-body">
          {r.requesterNote && (
            <p className="ws-note"><strong>Note from {personName(r.requestedBy)}:</strong> {r.requesterNote}</p>
          )}

          {rows.length > 0 ? (
            <table className="ws-diff">
              <thead>
                <tr>
                  <th>Field</th>
                  {r.before && <th>Current</th>}
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td>{row.field}</td>
                    {r.before && <td className="ws-diff-old">{row.current}</td>}
                    <td className="ws-diff-new">{row.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-user-sub">
              {r.action === "delete" ? "This removes the item from the app." : "No field changes — this request only changes visibility or status."}
            </p>
          )}

          {!isPending && (r.reviewNote || r.reviewedBy) && (
            <p className="ws-note">
              <strong>
                {r.status === "cancelled" ? "Withdrawn" : `${r.status === "approved" ? "Approved" : "Rejected"} by ${personName(r.reviewedBy)}`}
                {r.reviewedAt ? ` · ${timeAgo(r.reviewedAt)}` : ""}
              </strong>
              {r.reviewNote ? ` — ${r.reviewNote}` : ""}
            </p>
          )}

          {isPending && scope === "review" && (
            <div className="ws-decision">
              <textarea
                rows={2}
                placeholder="Note for the requester (required to reject)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="ws-dialog-actions">
                <button type="button" className="gy-btn gy-btn-danger" disabled={Boolean(busy)} onClick={() => act("reject")}>
                  {busy === "reject" ? <Loader2 className="spin-icon" size={14} /> : <X size={14} />} Reject
                </button>
                <button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => act("approve")}>
                  {busy === "approve" ? <Loader2 className="spin-icon" size={16} /> : <Check size={16} />} Approve &amp; apply
                </button>
              </div>
            </div>
          )}

          {isPending && scope === "mine" && (
            <div className="ws-dialog-actions">
              <button type="button" className="gy-btn gy-btn-ghost" disabled={Boolean(busy)} onClick={() => act("cancel")}>
                {busy === "cancel" ? <Loader2 className="spin-icon" size={14} /> : <Undo2 size={14} />} Withdraw request
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
};
