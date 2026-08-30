import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import {
  Coupon,
  CouponInput,
  DiscountType,
  adminListCoupons,
  createCoupon,
  deleteCoupon,
  updateCoupon
} from "../../api/subscriptionApi";

type FormState = {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  expiresAt: string;
  maxRedemptions: string;
  perUserLimit: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  expiresAt: "",
  maxRedemptions: "",
  perUserLimit: "1",
  isActive: true
};

function toForm(c: Coupon): FormState {
  return {
    code: c.code,
    description: c.description ?? "",
    discountType: c.discountType,
    discountValue: String(c.discountValue),
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
    maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : "",
    perUserLimit: String(c.perUserLimit),
    isActive: c.isActive
  };
}

function discountLabel(c: Coupon) {
  return c.discountType === "percentage" ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
}

function isExpired(c: Coupon) {
  return Boolean(c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now());
}

function isExhausted(c: Coupon) {
  return c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions;
}

/**
 * Coupon codes are store-wide (not scoped to a specific plan/feature) — the
 * app lets a user apply one to whatever they're buying at checkout, and a
 * 100%-off code activates instantly with no payment step at all. See
 * period-buddy-be's subscriptionController.js (createSubscriptionOrder /
 * previewCoupon) for the redemption logic this catalog feeds.
 */
export const CouponsTab: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCoupons(await adminListCoupons());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coupons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice(null);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c._id);
    setForm(toForm(c));
    setShowForm(true);
    setNotice(null);
  };

  const patchLocal = (id: string, updates: Partial<Coupon>) =>
    setCoupons((prev) => prev.map((c) => (c._id === id ? { ...c, ...updates } : c)));

  // Inline toggle for the common "pause this code" action — no need to open
  // the full edit form just to flip active/inactive.
  const toggleActive = async (c: Coupon) => {
    setBusyId(c._id);
    setError(null);
    try {
      const updated = await updateCoupon(c._id, { isActive: !c.isActive });
      patchLocal(c._id, updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this coupon.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) return setError("A coupon code is required.");
    const discountValue = Number(form.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return setError("Enter a discount value greater than 0.");
    }
    if (form.discountType === "percentage" && discountValue > 100) {
      return setError("A percentage discount cannot exceed 100.");
    }
    const perUserLimit = Number(form.perUserLimit) || 1;
    const maxRedemptions = form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null;

    setSubmitting(true);
    setError(null);
    try {
      const payload: CouponInput = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue,
        isActive: form.isActive,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        maxRedemptions,
        perUserLimit
      };
      if (editingId) {
        const updated = await updateCoupon(editingId, payload);
        patchLocal(editingId, updated);
        setNotice(`Updated "${updated.code}".`);
      } else {
        const created = await createCoupon(payload);
        setCoupons((prev) => [created, ...prev]);
        setNotice(`Created "${created.code}".`);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this coupon.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (c: Coupon) => {
    if (!window.confirm(`Delete coupon "${c.code}"? It will stop working immediately.`)) return;
    setBusyId(c._id);
    setError(null);
    try {
      await deleteCoupon(c._id);
      setCoupons((prev) => prev.filter((x) => x._id !== c._id));
      setNotice(`Deleted "${c.code}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this coupon.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="header-actions" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="gy-btn gy-btn-primary" onClick={openCreate} type="button">
          <Plus size={16} /> Add Coupon
        </button>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="gy-alert gy-alert-ok">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{editingId ? "Edit coupon" : "Add a new coupon"}</h3>
              <button className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <form className="gy-form-grid" onSubmit={handleSubmit}>
              <label className="gy-field">
                <span>Code *</span>
                <input
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="WELCOME50"
                  required
                />
              </label>
              <label className="gy-field">
                <span>Discount type *</span>
                <select value={form.discountType} onChange={(e) => set("discountType", e.target.value as DiscountType)}>
                  <option value="percentage">Percentage off</option>
                  <option value="flat">Flat amount off</option>
                </select>
              </label>
              <label className="gy-field">
                <span>Discount value * {form.discountType === "percentage" ? "(%)" : "(₹)"}</span>
                <input
                  type="number"
                  min={0}
                  max={form.discountType === "percentage" ? 100 : undefined}
                  value={form.discountValue}
                  onChange={(e) => set("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "50" : "99"}
                  required
                />
              </label>
              <label className="gy-field">
                <span>Expires on (optional)</span>
                <input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
              </label>
              <label className="gy-field">
                <span>Max total redemptions (optional)</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => set("maxRedemptions", e.target.value)}
                  placeholder="Unlimited"
                />
              </label>
              <label className="gy-field">
                <span>Per-user limit</span>
                <input
                  type="number"
                  min={1}
                  value={form.perUserLimit}
                  onChange={(e) => set("perUserLimit", e.target.value)}
                />
              </label>
              <label className="gy-field gy-field-full">
                <span>Description (internal note, optional)</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. Launch week promo shared on Instagram"
                />
              </label>
              <label className="gy-field gy-field-full gy-checkbox-field">
                <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
                <span>Active — redeemable in the app</span>
              </label>

              <div className="gy-form-actions gy-field-full">
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button className="gy-btn gy-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                  {editingId ? "Save changes" : "Create coupon"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading coupons…</span>
        </div>
      ) : coupons.length === 0 ? (
        <div className="gy-empty">
          <Tag size={22} />
          <span>No coupons yet. Click “Add Coupon” to create the first one.</span>
        </div>
      ) : (
        <div className="scheme-app-list">
          {coupons.map((c) => {
            const busy = busyId === c._id;
            const expired = isExpired(c);
            const exhausted = isExhausted(c);
            const effectivelyOff = !c.isActive || expired || exhausted;
            return (
              <div key={c._id} className="gy-card scheme-app-card">
                <div className="scheme-app-main">
                  <div className="scheme-app-info">
                    <div className="scheme-app-title-row">
                      <h3>{c.code}</h3>
                      <span className={`gy-pill ${effectivelyOff ? "gy-pill-muted" : "gy-pill-ok"}`}>
                        {!c.isActive ? "Inactive" : expired ? "Expired" : exhausted ? "Limit reached" : "Active"}
                      </span>
                    </div>
                    <p className="scheme-app-meta">
                      {discountLabel(c)} · Used {c.redeemedCount}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""} · Limit {c.perUserLimit}/user
                      {c.expiresAt ? ` · Expires ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                    </p>
                    {c.description && <p className="scheme-app-note">{c.description}</p>}
                  </div>

                  <div className="scheme-app-actions" style={{ flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                    <label className="gy-switch" title="Toggle active">
                      <input type="checkbox" checked={c.isActive} disabled={busy} onChange={() => toggleActive(c)} />
                      <span className="gy-switch-track" aria-hidden />
                      <span>{c.isActive ? "Active" : "Inactive"}</span>
                    </label>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="gy-btn gy-btn-ghost" onClick={() => openEdit(c)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="gy-btn gy-btn-danger"
                        disabled={busy}
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
