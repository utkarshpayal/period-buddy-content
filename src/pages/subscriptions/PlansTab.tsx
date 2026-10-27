import { isPendingApprovalError } from "../../api/approval";
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Package, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import {
  BILLING_CYCLES,
  BillingCycle,
  SubscriptionFeature,
  SubscriptionPlan,
  SubscriptionPlanInput,
  adminListFeatures,
  adminListPlans,
  billingCycleLabel,
  createPlan,
  deletePlan,
  updatePlan
} from "../../api/subscriptionApi";
import { useNoticeToast } from "../../components/Toast";

type FormState = {
  name: string;
  slug: string;
  description: string;
  price: string;
  billingCycle: BillingCycle;
  features: string[];
  isDefault: boolean;
  isActive: boolean;
  badge: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  price: "0",
  billingCycle: "monthly",
  features: [],
  isDefault: false,
  isActive: true,
  badge: ""
};

function toForm(p: SubscriptionPlan): FormState {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    price: String(p.price),
    billingCycle: p.billingCycle,
    features: p.features,
    isDefault: p.isDefault,
    isActive: p.isActive,
    badge: p.badge ?? ""
  };
}

export const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<SubscriptionFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, f] = await Promise.all([adminListPlans(), adminListFeatures()]);
      setPlans(p);
      setFeatures(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const featureName = useMemo(() => {
    const map = new Map(features.map((f) => [f.key, f.name]));
    return (key: string) => map.get(key) ?? key;
  }, [features]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleFeature = (key: string) =>
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(key) ? prev.features.filter((k) => k !== key) : [...prev.features, key]
    }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice(null);
  };

  const openEdit = (p: SubscriptionPlan) => {
    setEditingId(p._id);
    setForm(toForm(p));
    setShowForm(true);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Plan name is required.");
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return setError("A valid price is required.");

    setSubmitting(true);
    setError(null);
    try {
      const payload: SubscriptionPlanInput = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || undefined,
        price,
        billingCycle: form.billingCycle,
        features: form.features,
        isDefault: form.isDefault,
        isActive: form.isActive,
        badge: form.badge.trim() || undefined
      };
      if (editingId) {
        const updated = await updatePlan(editingId, payload);
        setPlans((prev) => prev.map((p) => (p._id === editingId ? updated : p)));
        setNotice(`Updated "${updated.name}".`);
      } else {
        const created = await createPlan(payload);
        setPlans((prev) => [...prev, created]);
        setNotice(`Created "${created.name}".`);
      }
      setShowForm(false);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        setShowForm(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save this plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (p: SubscriptionPlan) => {
    setBusyId(p._id);
    setError(null);
    try {
      const updated = await updatePlan(p._id, { isActive: !p.isActive });
      setPlans((prev) => prev.map((x) => (x._id === p._id ? updated : x)));
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update this plan.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p: SubscriptionPlan) => {
    if (!window.confirm(`Delete "${p.name}"? Users who already bought it keep access until it expires.`))
      return;
    setBusyId(p._id);
    setError(null);
    try {
      await deletePlan(p._id);
      setPlans((prev) => prev.filter((x) => x._id !== p._id));
      setNotice(`Deleted "${p.name}".`);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not delete this plan.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="header-actions" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="gy-btn gy-btn-primary" onClick={openCreate} type="button">
          <Plus size={16} /> Add Plan
        </button>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" data-esc-close onClick={() => setShowForm(false)}>
          <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{editingId ? "Edit plan" : "Add a new plan"}</h3>
              <button aria-label="Close" className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <form className="gy-form-grid" onSubmit={handleSubmit}>
              <label className="gy-field">
                <span>Name *</span>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Premium" required />
              </label>
              <label className="gy-field">
                <span>Slug (optional)</span>
                <input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated" />
              </label>
              <label className="gy-field">
                <span>Price *</span>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  required
                />
              </label>
              <label className="gy-field">
                <span>Billing cycle</span>
                <select value={form.billingCycle} onChange={(e) => set("billingCycle", e.target.value as BillingCycle)}>
                  {BILLING_CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {billingCycleLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gy-field">
                <span>Badge (optional)</span>
                <input value={form.badge} onChange={(e) => set("badge", e.target.value)} placeholder="Most popular" />
              </label>

              <label className="gy-field gy-field-full">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Shown under the plan name on the app's pricing screen."
                />
              </label>

              <div className="gy-field gy-field-full">
                <span>Included features</span>
                <div className="plan-feature-chips">
                  {features.map((f) => {
                    const on = form.features.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        className={`plan-feature-chip ${on ? "active" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleFeature(f.key)}
                      >
                        {on ? <Check size={14} /> : <Plus size={14} />}
                        {f.name}
                      </button>
                    );
                  })}
                  {features.length === 0 && <span className="subtitle-text">Add features first.</span>}
                </div>
              </div>

              <label className="gy-field gy-field-full gy-checkbox-field">
                <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
                <span>Active — purchasable / shown in the app</span>
              </label>
              <label className="gy-field gy-field-full gy-checkbox-field">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
                <span>This is the implicit Free plan (informational only)</span>
              </label>

              <div className="gy-form-actions gy-field-full">
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button className="gy-btn gy-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                  {editingId ? "Save changes" : "Create plan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading plans…</span>
        </div>
      ) : plans.length === 0 ? (
        <div className="gy-empty">
          <Package size={22} />
          <span>No plans yet. Bundle features together, or skip this and sell features individually.</span>
        </div>
      ) : (
        <div className="scheme-app-list">
          {plans.map((p) => {
            const busy = busyId === p._id;
            return (
              <div key={p._id} className="gy-card scheme-app-card">
                <div className="scheme-app-main">
                  <div className="scheme-app-info">
                    <div className="scheme-app-title-row">
                      <h3>{p.name}</h3>
                      <span className="gy-pill gy-pill-info">
                        {p.price} · {billingCycleLabel(p.billingCycle)}
                      </span>
                      {p.badge && <span className="gy-pill gy-pill-plum">{p.badge}</span>}
                      {p.isDefault && <span className="gy-pill gy-pill-muted">Free plan</span>}
                    </div>
                    {p.description && <p className="scheme-app-note">{p.description}</p>}
                    <p className="scheme-app-meta">
                      {p.features.length === 0
                        ? "No features included"
                        : p.features.map(featureName).join(", ")}
                    </p>
                  </div>

                  <div className="sub-item-actions">
                    <label className="gy-switch" title="Show this plan in the app">
                      <input type="checkbox" checked={p.isActive} disabled={busy} onChange={() => toggleActive(p)} />
                      <span className="gy-switch-track" aria-hidden />
                      <span>{p.isActive ? "Active" : "Hidden"}</span>
                    </label>
                    <button type="button" className="gy-btn gy-btn-ghost" onClick={() => openEdit(p)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="gy-icon-btn gy-icon-btn-danger"
                      disabled={busy}
                      onClick={() => handleDelete(p)}
                      title="Delete"
                      aria-label="Delete"
                    >
                      {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                    </button>
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
