import React, { useCallback, useEffect, useState } from "react";
import { BadgeIndianRupee, CheckCircle2, Copy, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import type { PayoutStatus } from "../../api/doctorApi";
import {
  AdminPayout,
  PayoutMethodDetails,
  approvePayout,
  getPayoutMethodDetails,
  listPayouts,
  markPayoutPaid,
  rejectPayout,
  syncPayout
} from "../../api/financeApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Notice, Segmented } from "../../components/financeUi";
import { ErrorAlert, Loading, PayoutPill, dateTime, errorText, inr } from "./shared";

type Filter = "requested" | "inflight" | "success" | "problem" | "all";

const FILTERS: { value: Filter; label: string; statuses?: PayoutStatus[] }[] = [
  { value: "requested", label: "Awaiting approval", statuses: ["requested"] },
  { value: "inflight", label: "In progress", statuses: ["approved", "processing"] },
  { value: "success", label: "Paid", statuses: ["success"] },
  { value: "problem", label: "Failed / declined", statuses: ["failed", "reversed", "rejected", "cancelled"] },
  { value: "all", label: "All" }
];

export const PayoutsTab: React.FC = () => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.PAYOUTS_MANAGE);
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("requested");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminPayout[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState<AdminPayout | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [paying, setPaying] = useState<AdminPayout | null>(null);
  const [details, setDetails] = useState<PayoutMethodDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses = FILTERS.find((f) => f.value === filter)?.statuses;
      const result = await listPayouts({ page, status: statuses });
      setRows(result.payouts);
      setPagination(result.pagination);
    } catch (err) {
      setError(errorText(err, "Could not load withdrawals."));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const replaceRow = (id: string, next: Partial<AdminPayout>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...next } : r)));

  const approve = async (p: AdminPayout) => {
    const who = p.doctor?.name ?? "this doctor";
    if (!window.confirm(`Send ${inr(p.amount)} to ${who} (${p.method?.display ?? "their payout method"}) now? This moves real money.`)) return;
    setBusyId(p._id);
    try {
      const updated = await approvePayout(p._id);
      replaceRow(p._id, updated);
      if (updated.status === "failed") toast.error(`Cashfree refused it: ${updated.failureReason ?? "unknown reason"}. The money is back in the doctor's wallet.`);
      else toast.success(updated.status === "success" ? "Paid." : "Approved and sent to Cashfree.");
    } catch (err) {
      toast.error(errorText(err, "Could not approve."));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const openPay = async (p: AdminPayout) => {
    setPaying(p);
    setDetails(null);
    setDetailsError(null);
    setReference("");
    try {
      setDetails(await getPayoutMethodDetails(p._id));
    } catch (err) {
      setDetailsError(errorText(err, "Could not load the bank details."));
    }
  };

  const submitPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paying) return;
    if (!/^[A-Za-z0-9 _/-]{4,64}$/.test(reference.trim())) return toast.error("Enter the bank reference / UTR of your transfer.");
    setBusyId(paying._id);
    try {
      const updated = await markPayoutPaid(paying._id, reference.trim());
      replaceRow(paying._id, updated);
      toast.success("Marked as paid. The doctor has been emailed.");
      setPaying(null);
    } catch (err) {
      toast.error(errorText(err, "Could not mark it as paid."));
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejecting) return;
    if (rejectNote.trim().length < 3) return toast.error("Tell the doctor why it was declined.");
    setBusyId(rejecting._id);
    try {
      const updated = await rejectPayout(rejecting._id, rejectNote.trim());
      replaceRow(rejecting._id, updated);
      toast.success("Declined. The doctor was emailed and the amount is back in their wallet.");
      setRejecting(null);
      setRejectNote("");
    } catch (err) {
      toast.error(errorText(err, "Could not decline."));
    } finally {
      setBusyId(null);
    }
  };

  const check = async (p: AdminPayout) => {
    setBusyId(p._id);
    try {
      const updated = await syncPayout(p._id);
      replaceRow(p._id, updated);
      toast.success(`Status: ${updated.status}`);
    } catch (err) {
      toast.error(errorText(err, "Could not reach Cashfree."));
    } finally {
      setBusyId(null);
    }
  };

  const copy = (text?: string) => {
    if (text) navigator.clipboard?.writeText(text).then(() => toast.success("Copied."), () => undefined);
  };

  return (
    <div className="cf-stack">
      <div className="cf-toolbar">
        <Segmented
          label="Filter withdrawals"
          items={FILTERS}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
        />
        <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : undefined} /> Refresh
        </button>
      </div>

      <ErrorAlert message={error} />

      <div className="cf-table-card">
        {loading && rows.length === 0 ? (
          <Loading label="Loading withdrawals…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<Send size={22} />} title={filter === "requested" ? "Nothing waiting for approval" : "No withdrawals here"}>
            {filter === "requested" ? "New requests from doctors show up here." : "Try another filter."}
          </EmptyRow>
        ) : (
          <div className="cf-table-scroll">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th className="num">Amount</th>
                  <th>Pay to</th>
                  <th>Status</th>
                  <th>Requested</th>
                  {canManage && <th className="actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const busy = busyId === p._id;
                  return (
                    <tr key={p._id}>
                      <td>
                        <div className="cf-cell-title">{p.doctor?.name ?? "Removed doctor"}</div>
                        {p.doctor?.email && <div className="cf-cell-sub">{p.doctor.email}</div>}
                      </td>
                      <td className="num cf-cell-title">{inr(p.amount)}</td>
                      <td>
                        <div>{p.method?.display ?? "—"}</div>
                        <div className="cf-cell-sub">
                          {p.method?.type === "upi" ? "UPI" : "Bank"} · {p.provider === "manual" ? "Manual" : "Cashfree"}
                        </div>
                      </td>
                      <td>
                        <PayoutPill status={p.status} />
                        {p.utr && <div className="cf-cell-sub">UTR {p.utr}</div>}
                        {p.failureReason && <div className="cf-cell-sub is-danger">{p.failureReason}</div>}
                        {p.reviewNote && p.status === "rejected" && <div className="cf-cell-sub">“{p.reviewNote}”</div>}
                      </td>
                      <td className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{dateTime(p.createdAt)}</td>
                      {canManage && (
                        <td className="actions">
                          <div>
                            {p.status === "requested" && (
                              <>
                                {p.provider === "manual" ? (
                                  <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" disabled={busy} onClick={() => openPay(p)}>
                                    <BadgeIndianRupee size={14} /> Pay &amp; mark paid
                                  </button>
                                ) : (
                                  <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" disabled={busy} onClick={() => approve(p)}>
                                    {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Approve
                                  </button>
                                )}
                                <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" disabled={busy} onClick={() => setRejecting(p)}>
                                  Decline
                                </button>
                              </>
                            )}
                            {p.provider !== "manual" && ["approved", "processing", "success"].includes(p.status) && (
                              <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" disabled={busy} onClick={() => check(p)} title="Ask Cashfree for the latest status">
                                {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Check
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-table-foot">
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="withdrawals" />}
        </div>
      </div>

      {paying && (
        <Modal
          title={`Pay ${inr(paying.amount)}`}
          subtitle={`To ${paying.doctor?.name ?? "this doctor"}`}
          onClose={() => setPaying(null)}
          onSubmit={submitPaid}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setPaying(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={busyId === paying._id || !details}>
                {busyId === paying._id ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Mark as paid
              </button>
            </>
          }
        >
          <div className="cf-field">
            <span className="cf-label">1. Transfer {inr(paying.amount)} from the company account to</span>
            {detailsError ? (
              <ErrorAlert message={detailsError} />
            ) : !details ? (
              <Loading label="Loading bank details…" />
            ) : (
              <dl className="cf-details">
                <dt>Name</dt>
                <dd>{details.accountHolderName}</dd>
                {details.type === "upi" ? (
                  <>
                    <dt>UPI ID</dt>
                    <dd>
                      {details.vpa}
                      <button type="button" className="cf-icon-btn" aria-label="Copy UPI ID" onClick={() => copy(details.vpa)}><Copy size={14} /></button>
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>Account no.</dt>
                    <dd>
                      {details.accountNumber}
                      <button type="button" className="cf-icon-btn" aria-label="Copy account number" onClick={() => copy(details.accountNumber)}><Copy size={14} /></button>
                    </dd>
                    <dt>IFSC</dt>
                    <dd>
                      {details.ifsc}
                      <button type="button" className="cf-icon-btn" aria-label="Copy IFSC" onClick={() => copy(details.ifsc)}><Copy size={14} /></button>
                    </dd>
                  </>
                )}
              </dl>
            )}
            {details?.status === "removed" && <Notice tone="warn">The doctor has since removed this method. Check with them before paying.</Notice>}
          </div>
          <Field label="2. Bank reference / UTR" hint="Only mark it paid once the money has left your account. The doctor is emailed this reference." htmlFor="cf-ref">
            <input id="cf-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} placeholder="e.g. 427812345678" autoComplete="off" />
          </Field>
        </Modal>
      )}

      {rejecting && (
        <Modal
          title="Decline withdrawal"
          subtitle={`${inr(rejecting.amount)} for ${rejecting.doctor?.name ?? "this doctor"}. The amount goes back to their wallet.`}
          onClose={() => setRejecting(null)}
          onSubmit={submitReject}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setRejecting(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={busyId === rejecting._id}>
                {busyId === rejecting._id ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />} Decline
              </button>
            </>
          }
        >
          <Field label="Reason (emailed to the doctor)" htmlFor="cf-reject">
            <textarea id="cf-reject" rows={3} maxLength={300} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Bank details need to be re-verified" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
};
