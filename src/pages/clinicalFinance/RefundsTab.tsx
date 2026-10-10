import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { ConsultationRefund, RefundStatus, listRefunds, markRefundProcessed, retryRefund } from "../../api/financeApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Notice, Pill, Segmented, useLatestRequest } from "../../components/financeUi";
import { ErrorAlert, Loading, dateTime, errorText, inr } from "./shared";

const FILTERS: { value: RefundStatus; label: string }[] = [
  { value: "required", label: "To refund" },
  { value: "processed", label: "Refunded" }
];

const CANCELLED_BY: Record<string, string> = {
  patient: "Patient",
  doctor: "Doctor",
  system: "System"
};

/** Where the automatic Cashfree refund stands, for the "To refund" list. */
const AutoState: React.FC<{ refund: ConsultationRefund }> = ({ refund }) => {
  const auto = refund.auto;
  if (!auto?.status) return <Pill tone="info">Queued</Pill>;
  if (auto.status === "pending") {
    return (
      <>
        <Pill tone="info">Processing at Cashfree</Pill>
        {auto.refundId && <div className="cf-cell-sub">Refund id {auto.refundId}</div>}
      </>
    );
  }
  if (auto.status === "skipped") {
    return (
      <>
        <Pill tone="muted">Refund by hand</Pill>
        {auto.lastError && <div className="cf-cell-sub">{auto.lastError}</div>}
      </>
    );
  }
  // failed
  return (
    <>
      <Pill tone={auto.nextAttemptAt ? "warn" : "danger"}>{auto.nextAttemptAt ? "Failed, retrying" : "Failed"}</Pill>
      {auto.lastError && <div className="cf-cell-sub is-danger">{auto.lastError}</div>}
      <div className="cf-cell-sub">
        {auto.attempts} attempt{auto.attempts === 1 ? "" : "s"}
        {auto.nextAttemptAt ? ` · next ${dateTime(auto.nextAttemptAt)}` : " · no more automatic tries"}
      </div>
    </>
  );
};

/**
 * Cancelled paid consultations owed a refund. Refunds go out automatically
 * through Cashfree; this list shows where each stands. One that can't be
 * automatic or keeps failing can be retried, or refunded in the Cashfree
 * dashboard and marked here. Listing needs payouts.read; acting needs
 * payouts.manage.
 */
export const RefundsTab: React.FC = () => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.PAYOUTS_MANAGE);
  const toast = useToast();

  const [status, setStatus] = useState<RefundStatus>("required");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ConsultationRefund[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [marking, setMarking] = useState<ConsultationRefund | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const list = useLatestRequest();

  const load = useCallback(async () => {
    const token = list.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await listRefunds({ page, status });
      if (!list.isLatest(token)) return;
      setRows(result.refunds);
      setPagination(result.pagination);
    } catch (err) {
      if (list.isLatest(token)) setError(errorText(err, "Could not load refunds."));
    } finally {
      if (list.isLatest(token)) setLoading(false);
    }
  }, [page, status, list]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = (text?: string | null) => {
    if (text) navigator.clipboard?.writeText(text).then(() => toast.success("Copied."), () => undefined);
  };

  const openMark = (r: ConsultationRefund) => {
    setReference("");
    setMarking(r);
  };

  const retry = async (r: ConsultationRefund) => {
    if (retrying) return;
    setRetrying(r._id);
    try {
      const result = await retryRefund(r._id);
      if (result.outcome === "success") toast.success(`${inr(r.amount)} refunded through Cashfree.`);
      else if (result.outcome === "pending") toast.success("Sent to Cashfree. It's processing the refund.");
      else toast.error("Cashfree didn't take it. See the reason in the list.");
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not retry the refund."));
    } finally {
      setRetrying(null);
    }
  };

  const submitMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marking || busy) return;
    setBusy(true);
    try {
      await markRefundProcessed(marking._id, reference);
      toast.success(`Marked ${inr(marking.amount)} as refunded.`);
      setMarking(null);
      // It leaves the "To refund" list.
      setRows((prev) => prev.filter((r) => r._id !== marking._id));
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not mark it as refunded."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cf-stack">
      <Notice tone="info">
        Cancelled paid sessions are refunded automatically through Cashfree, back to the patient's original payment method. Only refund one by hand if it says “Refund by hand” or “Failed”, then mark it here. Amounts are in INR.
      </Notice>

      <div className="cf-toolbar">
        <Segmented
          label="Refund status"
          items={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v);
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
          <Loading label="Loading refunds…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<RotateCcw size={22} />} title={status === "required" ? "No refunds waiting" : "No refunds yet"}>
            {status === "required" ? "Cancelled paid sessions show up here." : "Refunds you mark as done are listed here."}
          </EmptyRow>
        ) : (
          <div className="cf-table-scroll">
            <table className="cf-table is-wide">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th className="num">Amount</th>
                  <th>Cancelled</th>
                  <th>Cashfree order</th>
                  {status === "required" && <th>Automatic refund</th>}
                  {status === "processed" && <th>Refunded</th>}
                  {canManage && status === "required" && <th className="actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div className="cf-cell-title">{r.patient?.name || "Removed patient"}</div>
                      {r.patient?.email && <div className="cf-cell-sub">{r.patient.email}</div>}
                      {r.patient?.phone && <div className="cf-cell-sub">{r.patient.phone}</div>}
                    </td>
                    <td>{r.doctor?.name ?? "Removed doctor"}</td>
                    <td className="num cf-cell-title">{inr(r.amount)}</td>
                    <td>
                      <div style={{ whiteSpace: "nowrap" }}>{dateTime(r.cancelledAt)}</div>
                      <div className="cf-cell-sub">
                        By {CANCELLED_BY[r.cancelledBy ?? ""] ?? "—"}
                        {r.scheduledFor ? ` · session ${dateTime(r.scheduledFor)}` : ""}
                      </div>
                      {r.cancelReason && <div className="cf-cell-sub">“{r.cancelReason}”</div>}
                    </td>
                    <td>
                      {r.cashfreeOrderId ? (
                        <span style={{ alignItems: "center", display: "inline-flex", gap: 4 }}>
                          <code>{r.cashfreeOrderId}</code>
                          <button type="button" className="cf-icon-btn" aria-label="Copy Cashfree order id" onClick={() => copy(r.cashfreeOrderId)}>
                            <Copy size={14} />
                          </button>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {status === "required" && (
                      <td>
                        <AutoState refund={r} />
                      </td>
                    )}
                    {status === "processed" && (
                      <td>
                        <Pill tone="ok">{r.auto?.status === "success" ? "Refunded automatically" : "Refunded"}</Pill>
                        <div className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{dateTime(r.refundedAt)}</div>
                        {r.refundReference && <div className="cf-cell-sub">Ref {r.refundReference}</div>}
                      </td>
                    )}
                    {canManage && status === "required" && (
                      <td className="actions">
                        <div>
                          {(r.auto?.status === "failed" || r.auto?.status === "skipped") && r.cashfreeOrderId && (
                            <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" disabled={retrying !== null} onClick={() => retry(r)}>
                              {retrying === r._id ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Retry
                            </button>
                          )}
                          {r.auto?.status !== "pending" && (
                            <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" disabled={busy} onClick={() => openMark(r)}>
                              <CheckCircle2 size={14} /> Mark refunded
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-table-foot">
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="refunds" />}
        </div>
      </div>

      {marking && (
        <Modal
          title={`Mark ${inr(marking.amount)} as refunded`}
          subtitle={`To ${marking.patient?.name || "the patient"} · session with ${marking.doctor?.name ?? "the doctor"}`}
          onClose={() => !busy && setMarking(null)}
          onSubmit={submitMark}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setMarking(null)} disabled={busy}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Mark refunded
              </button>
            </>
          }
        >
          {marking.cashfreeOrderId && (
            <p className="cf-help">
              Cashfree order <code>{marking.cashfreeOrderId}</code>
            </p>
          )}
          {marking.auto?.status === "failed" && marking.auto.nextAttemptAt && (
            <Notice tone="warn">The automatic refund will try again at {dateTime(marking.auto.nextAttemptAt)}. If you refund it by hand, mark it here first so it stops.</Notice>
          )}
          <Field label="Refund reference (optional)" hint="e.g. the Cashfree refund id. Only mark it once the refund has been made." htmlFor="cf-refund-ref">
            <input id="cf-refund-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoComplete="off" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
};
