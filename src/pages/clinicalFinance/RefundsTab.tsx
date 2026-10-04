import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { ConsultationRefund, RefundStatus, listRefunds, markRefundProcessed } from "../../api/financeApi";
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

/**
 * Cancelled paid consultations owed a refund. Refunds are made by hand in the
 * Cashfree dashboard (find the order by its id), then marked here. Listing
 * needs payouts.read; marking needs payouts.manage.
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
        Refund cancelled sessions in the Cashfree dashboard (search by the order id), then mark them refunded here. Amounts are in INR.
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
                    {status === "processed" && (
                      <td>
                        <Pill tone="ok">Refunded</Pill>
                        <div className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{dateTime(r.refundedAt)}</div>
                        {r.refundReference && <div className="cf-cell-sub">Ref {r.refundReference}</div>}
                      </td>
                    )}
                    {canManage && status === "required" && (
                      <td className="actions">
                        <div>
                          <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" disabled={busy} onClick={() => openMark(r)}>
                            <CheckCircle2 size={14} /> Mark refunded
                          </button>
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
          <Field label="Refund reference (optional)" hint="e.g. the Cashfree refund id. Only mark it once the refund has been made." htmlFor="cf-refund-ref">
            <input id="cf-refund-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoComplete="off" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
};
