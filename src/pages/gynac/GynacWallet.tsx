import React, { useEffect, useRef, useState } from "react";
import { Banknote, Building2, Clock, Loader2, Plus, Send, ShieldCheck, Smartphone, Star, Trash2 } from "lucide-react";
import {
  NewPayoutMethod,
  Payout,
  PayoutMethod,
  WalletData,
  addPayoutMethod,
  cancelWithdrawal,
  formatMoney,
  newIdempotencyKey,
  removePayoutMethod,
  requestWithdrawal,
  setDefaultPayoutMethod
} from "../../api/doctorApi";
import { formatDate } from "../../components/ui";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { EmptyRow, Field, Modal, Notice, Pill, type PillTone } from "../../components/financeUi";

/*
 * Clinician wallet: withdraw dialog, payout methods and withdrawal history
 * (styles/finance.css). The server re-checks everything (balance, limits,
 * cooldown, password); the checks here are only for quicker feedback.
 */

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const PAYOUT_LABEL: Record<Payout["status"], { label: string; tone: PillTone }> = {
  requested: { label: "Requested", tone: "warn" },
  approved: { label: "Sending", tone: "info" },
  processing: { label: "On its way", tone: "info" },
  success: { label: "Paid", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  reversed: { label: "Returned by bank", tone: "danger" }
};

export const PayoutBadge: React.FC<{ status: Payout["status"] }> = ({ status }) => {
  const meta = PAYOUT_LABEL[status] ?? { label: status, tone: "muted" as PillTone };
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
};

export const isCoolingDown = (m: PayoutMethod) => Boolean(m.usableFrom && new Date(m.usableFrom) > new Date());

const MethodIcon: React.FC<{ type: PayoutMethod["type"] }> = ({ type }) =>
  type === "upi" ? <Smartphone size={18} /> : <Building2 size={18} />;

const shortDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/* ------------------------------ Withdraw ------------------------------ */

export const WithdrawDialog: React.FC<{
  data: WalletData;
  onClose: () => void;
  onDone: (payout: Payout) => void;
}> = ({ data, onClose, onDone }) => {
  const { wallet, rules, methods } = data;
  const usable = methods.filter((m) => !isCoolingDown(m));
  const initial = usable.find((m) => m.isDefault) ?? usable[0];
  const max = Math.min(wallet.withdrawable, rules.maxWithdrawal);
  const [methodId, setMethodId] = useState(initial?._id ?? "");
  const [amount, setAmount] = useState(String(max));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per dialog: a retry after a timeout reuses it, so the server
  // returns the first withdrawal instead of creating a second one.
  const key = useRef(newIdempotencyKey());
  const value = Number(amount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!methodId) return setError("Choose where to send the money.");
    if (!Number.isFinite(value) || value <= 0 || Math.abs(Math.round(value * 100) - value * 100) > 1e-6) {
      return setError("Enter a valid amount (up to 2 decimals).");
    }
    if (value < rules.minWithdrawal) return setError(`The minimum withdrawal is ${formatMoney(rules.minWithdrawal)}.`);
    if (value > rules.maxWithdrawal) return setError(`The maximum per withdrawal is ${formatMoney(rules.maxWithdrawal)}.`);
    if (value > wallet.withdrawable) return setError(`You can withdraw up to ${formatMoney(wallet.withdrawable)}.`);
    setSubmitting(true);
    try {
      onDone(await requestWithdrawal({ amount: value, methodId }, key.current));
    } catch (err) {
      setError(errorText(err, "Could not request the withdrawal."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Withdraw earnings"
      subtitle={`Available: ${formatMoney(wallet.withdrawable)}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={submitting || !methodId}>
            {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            Withdraw {Number.isFinite(value) && value > 0 ? formatMoney(value) : ""}
          </button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Field
        label="Amount"
        htmlFor="gw-amount"
        hint={`Minimum ${formatMoney(rules.minWithdrawal)} · maximum ${formatMoney(rules.maxWithdrawal)} per withdrawal`}
      >
        <div className="gw-amount-row">
          <div className="cf-input-suffix">
            <input id="gw-amount" type="number" inputMode="decimal" min={rules.minWithdrawal} max={max} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <span>₹</span>
          </div>
          <button type="button" className="cf-btn cf-btn-secondary" onClick={() => setAmount(String(max))}>Max</button>
        </div>
      </Field>

      <div className="cf-field" role="radiogroup" aria-label="Send to">
        <span className="cf-label">Send to</span>
        {methods.map((m) => {
          const cooling = isCoolingDown(m);
          return (
            <label key={m._id} className={`gw-method-option ${methodId === m._id ? "is-selected" : ""} ${cooling ? "is-disabled" : ""}`}>
              <input type="radio" name="method" value={m._id} checked={methodId === m._id} disabled={cooling} onChange={() => setMethodId(m._id)} />
              <span className="gw-method-icon"><MethodIcon type={m.type} /></span>
              <span>
                <strong>{m.display}</strong>
                <small>{cooling ? `Usable from ${shortDateTime(m.usableFrom)}` : m.accountHolderName}</small>
              </span>
            </label>
          );
        })}
      </div>

      <p className="cf-help">
        {rules.provider === "manual" || rules.requireApproval
          ? "The Nura team sends it to your account, usually within 1–2 working days. You'll get an email with the bank reference."
          : "We send it straight away. Bank transfers usually arrive within minutes."}
      </p>
    </Modal>
  );
};

/* --------------------------- Payout methods --------------------------- */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

const AddMethodDialog: React.FC<{ cooldownHours: number; onClose: () => void; onAdded: (m: PayoutMethod) => void }> = ({
  cooldownHours,
  onClose,
  onAdded
}) => {
  const [type, setType] = useState<"bank" | "upi">("upi");
  const [form, setForm] = useState({ accountHolderName: "", accountNumber: "", confirmAccountNumber: "", ifsc: "", vpa: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.accountHolderName.trim();
    if (!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(name)) return setError("Enter the account holder's name as on the account.");
    let payload: NewPayoutMethod;
    if (type === "bank") {
      const acc = form.accountNumber.replace(/[\s-]/g, "");
      const ifsc = form.ifsc.trim().toUpperCase();
      if (!/^\d{9,18}$/.test(acc)) return setError("Account number must be 9 to 18 digits.");
      if (acc !== form.confirmAccountNumber.replace(/[\s-]/g, "")) return setError("Account numbers don't match.");
      if (!IFSC_RE.test(ifsc)) return setError("Enter a valid 11-character IFSC, e.g. HDFC0001234.");
      payload = { type, accountHolderName: name, accountNumber: acc, confirmAccountNumber: acc, ifsc, password: form.password };
    } else {
      const vpa = form.vpa.trim().toLowerCase();
      if (!VPA_RE.test(vpa)) return setError("Enter a valid UPI ID, e.g. name@okhdfcbank.");
      payload = { type, accountHolderName: name, vpa, password: form.password };
    }
    if (!form.password) return setError("Enter your password to confirm.");
    setSaving(true);
    try {
      onAdded(await addPayoutMethod(payload));
    } catch (err) {
      setError(errorText(err, "Could not add this payout method."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add a payout method"
      subtitle="Where your earnings are sent."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="cf-btn cf-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="cf-btn cf-btn-primary" type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Add {type === "bank" ? "bank account" : "UPI ID"}
          </button>
        </>
      }
    >
      <div className="gw-type-switch" role="tablist" aria-label="Method type">
        <button type="button" role="tab" aria-selected={type === "upi"} className={type === "upi" ? "is-active" : ""} onClick={() => setType("upi")}>
          <Smartphone size={16} /> UPI ID
        </button>
        <button type="button" role="tab" aria-selected={type === "bank"} className={type === "bank" ? "is-active" : ""} onClick={() => setType("bank")}>
          <Building2 size={16} /> Bank account
        </button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="cf-form-grid">
        <Field label="Account holder name" full htmlFor="gw-name">
          <input id="gw-name" value={form.accountHolderName} onChange={set("accountHolderName")} placeholder="As on your bank account" autoComplete="name" />
        </Field>
        {type === "bank" ? (
          <>
            <Field label="Account number" htmlFor="gw-acc">
              <input id="gw-acc" inputMode="numeric" value={form.accountNumber} onChange={set("accountNumber")} autoComplete="off" />
            </Field>
            <Field label="Confirm account number" htmlFor="gw-acc2">
              <input id="gw-acc2" inputMode="numeric" value={form.confirmAccountNumber} onChange={set("confirmAccountNumber")} autoComplete="off" onPaste={(e) => e.preventDefault()} />
            </Field>
            <Field label="IFSC" full htmlFor="gw-ifsc">
              <input id="gw-ifsc" value={form.ifsc} onChange={set("ifsc")} placeholder="HDFC0001234" maxLength={11} style={{ textTransform: "uppercase" }} autoComplete="off" />
            </Field>
          </>
        ) : (
          <Field label="UPI ID" full htmlFor="gw-vpa">
            <input id="gw-vpa" value={form.vpa} onChange={set("vpa")} placeholder="name@okhdfcbank" autoComplete="off" />
          </Field>
        )}
        <Field
          label="Your Nura password"
          full
          htmlFor="gw-pass"
          hint={
            <>
              <ShieldCheck size={12} style={{ verticalAlign: "-2px" }} /> We email you when a payout method is added
              {cooldownHours > 0 ? `, and it can receive money after ${cooldownHours} hours.` : "."}
            </>
          }
        >
          <input id="gw-pass" type="password" value={form.password} onChange={set("password")} autoComplete="current-password" />
        </Field>
      </div>
    </Modal>
  );
};

export const PayoutMethodsCard: React.FC<{
  data: WalletData;
  onChanged: () => void;
  notify: (message: string) => void;
}> = ({ data, onChanged, notify }) => {
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = data.rules.payoutsEnabled && data.methods.length < 3;

  const remove = async (m: PayoutMethod) => {
    if (!window.confirm(`Remove ${m.display}? You can add it again later.`)) return;
    setBusyId(m._id);
    setError(null);
    try {
      await removePayoutMethod(m._id);
      notify("Payout method removed.");
      onChanged();
    } catch (err) {
      setError(errorText(err, "Could not remove it."));
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (m: PayoutMethod) => {
    setBusyId(m._id);
    setError(null);
    try {
      await setDefaultPayoutMethod(m._id);
      onChanged();
    } catch (err) {
      setError(errorText(err, "Could not update it."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="gw-card">
      <div className="gw-card-head">
        <div>
          <h2>Payout methods</h2>
          <p>Bank account or UPI ID for withdrawals</p>
        </div>
        {canAdd && data.methods.length > 0 && (
          <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      <div className="gw-card-body">
        {error && <Notice tone="error">{error}</Notice>}
        {data.methods.length === 0 ? (
          <EmptyRow
            icon={<Banknote size={22} />}
            title="No payout method yet"
            action={
              canAdd && (
                <button type="button" className="cf-btn cf-btn-primary" onClick={() => setAdding(true)}>
                  <Plus size={16} /> Add UPI ID or bank account
                </button>
              )
            }
          >
            {data.rules.payoutsEnabled ? "Add where you'd like your earnings sent." : "Withdrawals are paused right now."}
          </EmptyRow>
        ) : (
          <ul className="gw-method-list">
            {data.methods.map((m) => (
              <li key={m._id}>
                <span className="gw-method-icon"><MethodIcon type={m.type} /></span>
                <span className="gw-method-text">
                  <strong>{m.display}</strong>
                  <small>
                    {m.accountHolderName}
                    {isCoolingDown(m) && (
                      <>
                        {" · "}
                        <Clock size={11} /> usable from {shortDateTime(m.usableFrom)}
                      </>
                    )}
                  </small>
                </span>
                {m.isDefault ? (
                  <Pill tone="ok">Default</Pill>
                ) : (
                  <button type="button" className="cf-icon-btn" title="Make default" aria-label={`Make ${m.display} default`} disabled={busyId === m._id} onClick={() => makeDefault(m)}>
                    <Star size={16} />
                  </button>
                )}
                <button type="button" className="cf-icon-btn" title="Remove" aria-label={`Remove ${m.display}`} disabled={busyId === m._id} onClick={() => remove(m)}>
                  {busyId === m._id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <AddMethodDialog
          cooldownHours={data.rules.newMethodCooldownHours}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            notify("Payout method added. We've emailed you a confirmation.");
            onChanged();
          }}
        />
      )}
    </section>
  );
};

/* ------------------------- Withdrawal history ------------------------- */

export const WithdrawalsCard: React.FC<{
  payouts: Payout[];
  pagination: PageInfo | null;
  onPage: (page: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
}> = ({ payouts, pagination, onPage, onChanged, notify }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh while something is on its way, so the status updates by itself.
  const inFlight = payouts.some((p) => ["approved", "processing"].includes(p.status));
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(onChanged, 30_000);
    return () => clearInterval(t);
  }, [inFlight, onChanged]);

  const cancel = async (p: Payout) => {
    if (!window.confirm(`Cancel this ${formatMoney(p.amount)} withdrawal? The money stays in your wallet.`)) return;
    setBusyId(p._id);
    setError(null);
    try {
      await cancelWithdrawal(p._id);
      notify("Withdrawal cancelled.");
    } catch (err) {
      setError(errorText(err, "Could not cancel it."));
    } finally {
      setBusyId(null);
      onChanged();
    }
  };

  return (
    <section className="gw-card">
      <div className="gw-card-head">
        <div>
          <h2>Withdrawals</h2>
          <p>Money sent to your account</p>
        </div>
      </div>
      {error && <div className="gw-card-body"><Notice tone="error">{error}</Notice></div>}
      {payouts.length === 0 ? (
        <EmptyRow icon={<Send size={22} />} title="No withdrawals yet">Your withdrawals and their status show here.</EmptyRow>
      ) : (
        <div className="cf-table-scroll">
          <table className="cf-table is-stack is-payouts">
            <thead>
              <tr>
                <th>Requested</th>
                <th>To</th>
                <th>Status</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p._id}>
                  <td className="cf-cell-sub c-date" style={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</td>
                  <td className="c-to">{p.method?.display ?? "—"}</td>
                  <td className="c-state">
                    <PayoutBadge status={p.status} />
                    {p.utr && <div className="cf-cell-sub">Ref {p.utr}</div>}
                    {p.failureReason && <div className="cf-cell-sub is-danger">{p.failureReason}</div>}
                    {p.status === "rejected" && p.reviewNote && <div className="cf-cell-sub">“{p.reviewNote}”</div>}
                    {p.status === "requested" && (
                      <div style={{ marginTop: 6 }}>
                        <button type="button" className="cf-btn cf-btn-danger cf-btn-sm" disabled={busyId === p._id} onClick={() => cancel(p)}>
                          Cancel request
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="num cf-cell-title c-net">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination && pagination.pages > 1 && (
        <div className="cf-table-foot">
          <Pagination pagination={pagination} onPageChange={onPage} itemLabel="withdrawals" />
        </div>
      )}
    </section>
  );
};
