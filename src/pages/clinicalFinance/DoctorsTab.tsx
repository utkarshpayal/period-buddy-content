import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, PlusCircle, Stethoscope } from "lucide-react";
import { DoctorWalletRow, addAdjustment, listDoctorWallets, setDoctorCommission } from "../../api/financeApi";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { useAppContext } from "../../context/AppContext";
import { PERMISSIONS } from "../../auth/access";
import { EmptyRow, Field, Modal, Pill, SearchField, useLatestRequest } from "../../components/financeUi";
import { ErrorAlert, Loading, errorText, inr } from "./shared";

export const DoctorsTab: React.FC = () => {
  const { can } = useAppContext();
  const canManage = can(PERMISSIONS.PAYOUTS_MANAGE);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DoctorWalletRow[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rateFor, setRateFor] = useState<DoctorWalletRow | null>(null);
  const [rate, setRate] = useState("");
  const [useDefault, setUseDefault] = useState(true);
  const [adjustFor, setAdjustFor] = useState<DoctorWalletRow | null>(null);
  const [adjust, setAdjust] = useState({ direction: "credit" as "credit" | "debit", amount: "", note: "" });
  const [saving, setSaving] = useState(false);
  const list = useLatestRequest();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const token = list.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await listDoctorWallets({ page, search: debounced });
      if (!list.isLatest(token)) return; // a newer search already answered
      setRows(result.doctors);
      setPagination(result.pagination);
    } catch (err) {
      if (list.isLatest(token)) setError(errorText(err, "Could not load doctors."));
    } finally {
      if (list.isLatest(token)) setLoading(false);
    }
  }, [page, debounced, list]);

  const openAdjust = (d: DoctorWalletRow) => {
    // Never carry a half-typed debit or note over to another doctor.
    setAdjust({ direction: "credit", amount: "", note: "" });
    setAdjustFor(d);
  };

  useEffect(() => {
    load();
  }, [load]);

  const openRate = (d: DoctorWalletRow) => {
    setRateFor(d);
    setUseDefault(d.commissionOverridePercent == null);
    setRate(String(d.commissionOverridePercent ?? d.commissionPercent));
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateFor) return;
    let value: number | null = null;
    if (!useDefault) {
      value = Number(rate);
      if (rate.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return toast.error("Enter a commission between 0 and 100%.");
    }
    setSaving(true);
    try {
      await setDoctorCommission(rateFor._id, value);
      toast.success(value == null ? `${rateFor.name} now uses the default rate.` : `${rateFor.name}'s commission is now ${value}%.`);
      setRateFor(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not save the rate."));
    } finally {
      setSaving(false);
    }
  };

  const saveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustFor) return;
    const amount = Number(adjust.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter an amount greater than 0.");
    if (adjust.note.trim().length < 3) return toast.error("Add a note explaining the adjustment.");
    const debit = adjust.direction === "debit";
    if (!window.confirm(`${debit ? "Deduct" : "Add"} ${inr(amount)} ${debit ? "from" : "to"} ${adjustFor.name}'s wallet?`)) return;
    setSaving(true);
    try {
      await addAdjustment({ doctorId: adjustFor._id, amount: debit ? -amount : amount, note: adjust.note.trim() });
      toast.success("Adjustment added.");
      setAdjustFor(null);
      setAdjust({ direction: "credit", amount: "", note: "" });
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not add the adjustment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cf-stack">
      <div className="cf-toolbar">
        <SearchField value={search} onChange={setSearch} placeholder="Search by name or email" label="Search doctors" />
        {pagination && <span className="cf-help">{pagination.total} doctor{pagination.total === 1 ? "" : "s"}</span>}
      </div>

      <ErrorAlert message={error} />

      <div className="cf-table-card">
        {loading && rows.length === 0 ? (
          <Loading label="Loading doctors…" />
        ) : rows.length === 0 ? (
          <EmptyRow icon={<Stethoscope size={22} />} title={debounced ? `No doctors match “${debounced}”` : "No doctors yet"} />
        ) : (
          <div className="cf-table-scroll">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Commission</th>
                  <th className="num">Withdrawable</th>
                  <th className="num">On hold</th>
                  <th className="num">Paid out</th>
                  <th className="num">Lifetime net</th>
                  {canManage && <th className="actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <div className="cf-cell-title">{d.name}</div>
                      <div className="cf-cell-sub">{d.email ?? d.specialty}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="cf-cell-title">{d.commissionPercent}%</span>{" "}
                      <Pill tone={d.commissionSource === "doctor" ? "info" : "muted"}>{d.commissionSource === "doctor" ? "Custom" : "Default"}</Pill>
                    </td>
                    <td className={`num cf-cell-title ${d.wallet.available < 0 ? "cf-cell-sub is-danger" : ""}`}>{inr(d.wallet.available)}</td>
                    <td className="num">{inr(d.wallet.onHold)}</td>
                    <td className="num">
                      {inr(d.wallet.withdrawn)}
                      {d.wallet.inFlight > 0 && <div className="cf-cell-sub">+{inr(d.wallet.inFlight)} pending</div>}
                    </td>
                    <td className="num">{inr(d.wallet.lifetimeNet)}</td>
                    {canManage && (
                      <td className="actions">
                        <div>
                          <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => openRate(d)}>
                            <Pencil size={13} /> Rate
                          </button>
                          <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => openAdjust(d)}>
                            <PlusCircle size={13} /> Adjust
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
          {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="doctors" />}
        </div>
      </div>

      {rateFor && (
        <Modal
          title="Commission rate"
          subtitle={rateFor.name}
          onClose={() => setRateFor(null)}
          onSubmit={saveRate}
          width={440}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setRateFor(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Save rate
              </button>
            </>
          }
        >
          <label className="cf-check">
            <input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} />
            Use the default rate
          </label>
          {!useDefault && (
            <Field label="Commission" htmlFor="cf-rate">
              <div className="cf-input-suffix">
                <input id="cf-rate" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} autoFocus />
                <span>%</span>
              </div>
            </Field>
          )}
          <p className="cf-help">Applies to sessions paid from now on. Sessions already paid keep the rate they were booked at.</p>
        </Modal>
      )}

      {adjustFor && (
        <Modal
          title="Wallet adjustment"
          subtitle={`${adjustFor.name} · withdrawable now ${inr(adjustFor.wallet.available)}`}
          onClose={() => setAdjustFor(null)}
          onSubmit={saveAdjustment}
          footer={
            <>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={() => setAdjustFor(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" type="submit" disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Add adjustment
              </button>
            </>
          }
        >
          <div className="cf-form-grid">
            <Field label="Type" htmlFor="cf-adj-type">
              <select id="cf-adj-type" value={adjust.direction} onChange={(e) => setAdjust((a) => ({ ...a, direction: e.target.value as "credit" | "debit" }))}>
                <option value="credit">Credit (add money)</option>
                <option value="debit">Debit (take money back)</option>
              </select>
            </Field>
            <Field label="Amount" htmlFor="cf-adj-amount">
              <div className="cf-input-suffix">
                <input id="cf-adj-amount" type="number" inputMode="decimal" min={0.01} step={0.01} value={adjust.amount} onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))} placeholder="0" />
                <span>₹</span>
              </div>
            </Field>
            <Field label="Note (the doctor sees this)" full htmlFor="cf-adj-note">
              <input id="cf-adj-note" maxLength={300} value={adjust.note} onChange={(e) => setAdjust((a) => ({ ...a, note: e.target.value }))} placeholder="e.g. Paid via NEFT on 5 Oct" />
            </Field>
          </div>
          <p className="cf-help">A debit can take the balance below zero; new earnings then cover it before anything can be withdrawn.</p>
        </Modal>
      )}
    </div>
  );
};
