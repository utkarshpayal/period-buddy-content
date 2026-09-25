import { isPendingApprovalError } from "../../api/approval";
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  BILLING_CYCLES,
  BillingCycle,
  SubscriptionFeature,
  SubscriptionFeatureInput,
  adminListFeatures,
  billingCycleLabel,
  createFeature,
  deleteFeature,
  updateFeature
} from "../../api/subscriptionApi";
import { useNoticeToast } from "../../components/Toast";

type FormState = {
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  key: "",
  name: "",
  description: "",
  category: "General",
  icon: "",
  isActive: true
};

function toForm(f: SubscriptionFeature): FormState {
  return {
    key: f.key,
    name: f.name,
    description: f.description ?? "",
    category: f.category,
    icon: f.icon ?? "",
    isActive: f.isActive
  };
}

export const FeaturesTab: React.FC = () => {
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
      setFeatures(await adminListFeatures());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load features.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, SubscriptionFeature[]>();
    for (const f of features) {
      const list = byCategory.get(f.category) ?? [];
      list.push(f);
      byCategory.set(f.category, list);
    }
    return Array.from(byCategory.entries());
  }, [features]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice(null);
  };

  const openEdit = (f: SubscriptionFeature) => {
    setEditingId(f._id);
    setForm(toForm(f));
    setShowForm(true);
    setNotice(null);
  };

  const patchLocal = (id: string, updates: Partial<SubscriptionFeature>) =>
    setFeatures((prev) => prev.map((f) => (f._id === id ? { ...f, ...updates } : f)));

  // Inline controls (the primary day-to-day action) write straight through —
  // no modal needed just to flip free/premium or change a price.
  const togglePremium = async (f: SubscriptionFeature) => {
    setBusyId(f._id);
    setError(null);
    try {
      const updated = await updateFeature(f._id, { isPremium: !f.isPremium });
      patchLocal(f._id, updated);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update this feature.");
    } finally {
      setBusyId(null);
    }
  };

  const updatePrice = async (f: SubscriptionFeature, price: number) => {
    setBusyId(f._id);
    setError(null);
    try {
      const updated = await updateFeature(f._id, { price });
      patchLocal(f._id, updated);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update the price.");
    } finally {
      setBusyId(null);
    }
  };

  const updateCycle = async (f: SubscriptionFeature, billingCycle: BillingCycle) => {
    setBusyId(f._id);
    setError(null);
    try {
      const updated = await updateFeature(f._id, { billingCycle });
      patchLocal(f._id, updated);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update the billing cycle.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Feature name is required.");
    if (!editingId && !form.key.trim()) return setError("A feature key is required.");

    setSubmitting(true);
    setError(null);
    try {
      const payload: SubscriptionFeatureInput = {
        key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || "General",
        icon: form.icon.trim() || undefined,
        isActive: form.isActive
      };
      if (editingId) {
        const updated = await updateFeature(editingId, payload);
        patchLocal(editingId, updated);
        setNotice(`Updated "${updated.name}".`);
      } else {
        const created = await createFeature(payload);
        setFeatures((prev) => [...prev, created]);
        setNotice(`Created "${created.name}".`);
      }
      setShowForm(false);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        setShowForm(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save this feature.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: SubscriptionFeature) => {
    if (!window.confirm(`Delete "${f.name}"? Plans that include it will simply stop granting it.`))
      return;
    setBusyId(f._id);
    setError(null);
    try {
      await deleteFeature(f._id);
      setFeatures((prev) => prev.filter((x) => x._id !== f._id));
      setNotice(`Deleted "${f.name}".`);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not delete this feature.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="header-actions" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="gy-btn gy-btn-primary" onClick={openCreate} type="button">
          <Plus size={16} /> Add Feature
        </button>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{editingId ? "Edit feature" : "Add a new feature"}</h3>
              <button className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <form className="gy-form-grid" onSubmit={handleSubmit}>
              <label className="gy-field">
                <span>Key * {editingId && <em>(locked once created)</em>}</span>
                <input
                  value={form.key}
                  onChange={(e) => set("key", e.target.value)}
                  placeholder="ai_assistant"
                  disabled={!!editingId}
                  required
                />
              </label>
              <label className="gy-field">
                <span>Display name *</span>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Nura AI Assistant"
                  required
                />
              </label>
              <label className="gy-field">
                <span>Category</span>
                <input
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="AI & Insights"
                />
              </label>
              <label className="gy-field">
                <span>Icon (lucide name, optional)</span>
                <input
                  value={form.icon}
                  onChange={(e) => set("icon", e.target.value)}
                  placeholder="Sparkles"
                />
              </label>
              <label className="gy-field gy-field-full">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What this feature unlocks, shown on the app's paywall."
                />
              </label>
              <label className="gy-field gy-field-full gy-checkbox-field">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set("isActive", e.target.checked)}
                />
                <span>Active — shown at all in pricing/paywall UI</span>
              </label>

              <div className="gy-form-actions gy-field-full">
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button className="gy-btn gy-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                  {editingId ? "Save changes" : "Create feature"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading features…</span>
        </div>
      ) : features.length === 0 ? (
        <div className="gy-empty">
          <ListChecks size={22} />
          <span>No features yet. Click “Add Feature” to create the first one.</span>
        </div>
      ) : (
        grouped.map(([category, list]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>{category}</p>
            <div className="scheme-app-list">
              {list.map((f) => {
                const busy = busyId === f._id;
                return (
                  <div key={f._id} className="gy-card scheme-app-card">
                    <div className="scheme-app-main">
                      <div className="scheme-app-info">
                        <div className="scheme-app-title-row">
                          <h3>{f.name}</h3>
                          <span className={`gy-pill ${f.isPremium ? "gy-pill-plum" : "gy-pill-ok"}`}>
                            {f.isPremium ? "Premium" : "Free"}
                          </span>
                          {!f.isActive && <span className="gy-pill gy-pill-muted">Hidden</span>}
                        </div>
                        <p className="scheme-app-meta">Key: {f.key}</p>
                        {f.description && <p className="scheme-app-note">{f.description}</p>}
                      </div>

                      <div className="scheme-app-actions" style={{ flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                        <label className="gy-switch" title="Toggle free/premium">
                          <input
                            type="checkbox"
                            checked={f.isPremium}
                            disabled={busy}
                            onChange={() => togglePremium(f)}
                          />
                          <span className="gy-switch-track" aria-hidden />
                          <span>{f.isPremium ? "Premium" : "Free"}</span>
                        </label>

                        {f.isPremium && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="number"
                              min={0}
                              className="gy-inline-input"
                              defaultValue={f.price}
                              disabled={busy}
                              onBlur={(e) => {
                                const price = Math.max(0, Number(e.target.value) || 0);
                                if (price !== f.price) updatePrice(f, price);
                              }}
                            />
                            <select
                              className="gy-inline-select"
                              value={f.billingCycle}
                              disabled={busy}
                              onChange={(e) => updateCycle(f, e.target.value as BillingCycle)}
                            >
                              {BILLING_CYCLES.map((c) => (
                                <option key={c} value={c}>
                                  {billingCycleLabel(c)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="gy-btn gy-btn-ghost" onClick={() => openEdit(f)}>
                            <Pencil size={14} /> Edit
                          </button>
                          <button
                            type="button"
                            className="gy-btn gy-btn-danger"
                            disabled={busy}
                            onClick={() => handleDelete(f)}
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
          </div>
        ))
      )}
    </div>
  );
};
