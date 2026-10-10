import React, { useCallback, useEffect, useState } from "react";
import { BookOpenText, Loader2, Undo2 } from "lucide-react";
import { LedgerEarning, listEarnings, reverseEarning } from "../../api/financeApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Pill, useLatestRequest } from "../../components/financeUi";
import { ErrorAlert, Loading, dateTime, earningState, errorText, inr } from "./shared";

type StatusFilter = "" | "on_hold" | "available" | "reversed";
type TypeFilter = "" | "consultation" | "adjustment";

export const LedgerTab: React.FC = () => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.PAYOUTS_MANAGE);
  const toast = useToast();

  const [status, setStatus] = useState<StatusFilter>("");
  const [type, setType] = useState<TypeFilter>("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LedgerEarning[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<LedgerEarning | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const list = useLatestRequest();

  const load = useCallback(async () => {
    const token = list.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await listEarnings({ page, status: status || undefined, type: type || undefined });
      if (!list.isLatest(token)) return;
      setRows(result.earnings);
      setPagination(result.pagination);
    } catch (err) {
      if (list.isLatest(token)) setError(errorText(err, "Could not load the ledger."));
    } finally {
      if (list.isLatest(token)) setLoading(false);
    }
  }, [page, status, type, list]);

  const openReverse = (e: LedgerEarning) => {
    setReason("");
    setReversing(e);
  };

  useEffect(() => {
    load();
  }, [load]);

  const submitReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversing) return;
    if (reason.trim().length < 3) return toast.error("Give a reason for the reversal.");
    setSaving(true);
    try {
      await reverseEarning(reversing._id, reason.trim());
      toast.success("Earning reversed. It no longer counts towards the doctor's wallet.");
      setReversing(null);
      setReason("");
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not reverse."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cf-stack">
      <div className="cf-toolbar">
        <div className="cf-toolbar-group">
          <select className="cf-select" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }} aria-label="Status">
            <option value="">All statuses</option>
            <option value="on_hold">On hold</option>
            <option value="available">Withdrawable</option>
            <option value="reversed">Reversed</option>
          </select>
          <select className="cf-select" value={type} onChange={(e) => { setType(e.target.value as TypeFilter); setPage(1); }} aria-label="Type">
            <option value="">Sessions &amp; adjustments</option>
            <option value="consultation">Sessions only</option>
            <option value="adjustment">Adjustments only</option>
          </select>
        </div>
        {pagination && <span className="cf-help">{pagination.total} entr{pagination.total === 1 ? "y" : "ies"}</span>}
      </div>

      <ErrorAlert message={error} />

      <div className="cf-table-card">
        {loading && rows.length === 0 ? (
          <Loading label="Loading ledger…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<BookOpenText size={22} />} title="No entries">Every paid consultation adds a row here.</EmptyRow>
        ) : (
          <div className="cf-table-scroll">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Doctor</th>
                  <th className="num">Gross</th>
                  <th className="num">Commission</th>
                  <th className="num">Doctor net</th>
                  <th>Status</th>
                  {canManage && <th className="actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const state = earningState(e);
                  const adjustment = e.type === "adjustment";
                  return (
                    <tr key={e._id}>
                      <td className="cf-cell-sub" style={{ whiteSpace: "nowrap" }}>{dateTime(e.paidAt ?? e.createdAt)}</td>
                      <td>
                        <div className="cf-cell-title">{e.doctor?.name ?? "—"}</div>
                        <div className="cf-cell-sub">{adjustment ? `Adjustment · ${e.note ?? ""}` : "Consultation"}</div>
                      </td>
                      <td className="num">{adjustment ? "—" : inr(e.gross)}</td>
                      <td className="num">
                        {adjustment ? "—" : inr(e.commission)}
                        {!adjustment && (e.freeSession ? <div><Pill tone="ok">Referral · 0%</Pill></div> : <div className="cf-cell-sub">{e.commissionPercent}%</div>)}
                      </td>
                      <td className="num cf-cell-title">{inr(e.net)}</td>
                      <td>
                        <Pill tone={state.tone}>{state.label}</Pill>
                        {e.reversalReason && <div className="cf-cell-sub">{e.reversalReason}</div>}
                      </td>
                      {canManage && (
                        <td className="actions">
                          {e.status === "active" && (
                            <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => openReverse(e)} title="Remove this from the doctor's wallet">
                              <Undo2 size={13} /> Reverse
                            </button>
                          )}
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
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="entries" />}
        </div>
      </div>

      {reversing && (
        <Modal
          title="Reverse earning"
          subtitle={`${inr(reversing.net)} for ${reversing.doctor?.name ?? "this doctor"}. This can't be undone.`}
          onClose={() => setReversing(null)}
          onSubmit={submitReverse}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setReversing(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Reverse earning
              </button>
            </>
          }
        >
          <Field label="Reason" htmlFor="cf-reverse" hint="If the doctor already withdrew this money, their balance goes below zero and future earnings cover it.">
            <input id="cf-reverse" maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Patient refunded on 12 Sep" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
};
