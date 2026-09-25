import { isPendingApprovalError } from "../api/approval";
import React, { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  Plus,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import {
  GovernmentBenefit,
  GovernmentLevel,
  SchemeActionType,
  SchemeCategory,
  SchemeInput,
  SchemeType,
  SCHEME_ACTION_TYPES,
  SCHEME_CATEGORIES,
  SCHEME_TYPES,
  GOVERNMENT_LEVELS,
  adminListSchemes,
  createScheme,
  updateScheme,
  deleteScheme,
  arrayToLines,
  linesToArray,
  prettifyEnum
} from "../api/schemesApi";
import { useAppContext } from "../context/AppContext";
import { useNoticeToast } from "../components/Toast";

const PAGE_SIZE = 20;

// The form's local string-friendly shape; array fields are edited as
// newline-separated textareas and converted on submit.
type FormState = {
  name: string;
  shortName: string;
  type: SchemeType;
  governmentLevel: GovernmentLevel;
  state: string;
  categories: SchemeCategory[];
  description: string;
  benefits: string;
  eligibility: string;
  documents: string;
  actionType: SchemeActionType;
  applicationMethod: string;
  whereToGet: string;
  officialUrl: string;
  source: string;
  helpline: string;
  order: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  shortName: "",
  type: "scheme",
  governmentLevel: "central",
  state: "",
  categories: [],
  description: "",
  benefits: "",
  eligibility: "",
  documents: "",
  actionType: "LEARN_MORE",
  applicationMethod: "",
  whereToGet: "",
  officialUrl: "",
  source: "",
  helpline: "",
  order: "0",
  isActive: true
};

function toForm(s: GovernmentBenefit): FormState {
  return {
    name: s.name,
    shortName: s.shortName ?? "",
    type: s.type,
    governmentLevel: s.governmentLevel,
    state: s.state ?? "",
    categories: s.categories ?? [],
    description: s.description,
    benefits: arrayToLines(s.benefits),
    eligibility: arrayToLines(s.eligibility?.map((e) => e.text)),
    documents: arrayToLines(s.documents),
    actionType: s.actionType,
    applicationMethod: s.applicationMethod ?? "",
    whereToGet: s.whereToGet ?? "",
    officialUrl: s.officialUrl ?? "",
    source: s.source ?? "",
    helpline: s.helpline ?? "",
    order: String(s.order ?? 0),
    isActive: s.isActive
  };
}

function buildPayload(form: FormState): SchemeInput {
  const orderNum = Number(form.order);
  return {
    name: form.name.trim(),
    shortName: form.shortName.trim() || undefined,
    type: form.type,
    governmentLevel: form.governmentLevel,
    state: form.governmentLevel === "state" ? form.state.trim() || undefined : null,
    categories: form.categories,
    description: form.description.trim(),
    benefits: linesToArray(form.benefits),
    eligibility: linesToArray(form.eligibility).map((text) => ({ text })),
    documents: linesToArray(form.documents),
    actionType: form.actionType,
    applicationMethod: form.applicationMethod.trim() || undefined,
    whereToGet: form.whereToGet.trim() || undefined,
    officialUrl: form.officialUrl.trim() || undefined,
    source: form.source.trim() || undefined,
    helpline: form.helpline.trim() || undefined,
    order: Number.isFinite(orderNum) ? orderNum : 0,
    isActive: form.isActive
  };
}

const fmtLevel = (s: GovernmentBenefit) =>
  s.governmentLevel === "central" ? "Central" : s.state || "State";

export const SchemesPage: React.FC = () => {
  const { authSession } = useAppContext();

  const [schemes, setSchemes] = useState<GovernmentBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListSchemes({
        search: debouncedSearch || undefined,
        page: targetPage,
        limit: PAGE_SIZE
      });
      setSchemes(res.schemes);
      setPage(res.pagination.page);
      setPages(res.pagination.pages || 1);
      setTotal(res.pagination.total || res.schemes.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schemes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice(null);
  };

  const openEdit = (s: GovernmentBenefit) => {
    setEditingId(s._id);
    setForm(toForm(s));
    setShowForm(true);
    setNotice(null);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCategory = (cat: SchemeCategory) =>
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat]
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Scheme name is required.");
    if (!form.description.trim()) return setError("Description is required.");
    if (form.categories.length === 0) return setError("Pick at least one category.");

    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(form);
      if (editingId) {
        const res = await updateScheme(editingId, payload);
        setSchemes((prev) => prev.map((s) => (s._id === editingId ? res.scheme : s)));
        setNotice(`Updated "${res.scheme.name}".`);
      } else {
        const res = await createScheme(payload);
        setSchemes((prev) => [res.scheme, ...prev]);
        setTotal((t) => t + 1);
        setNotice(`Created "${res.scheme.name}".`);
      }
      setShowForm(false);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        setShowForm(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save this scheme.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (s: GovernmentBenefit) => {
    if (!window.confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    setDeletingId(s._id);
    setError(null);
    try {
      await deleteScheme(s._id);
      setSchemes((prev) => prev.filter((x) => x._id !== s._id));
      setTotal((t) => Math.max(0, t - 1));
      setNotice(`Deleted "${s.name}".`);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not delete this scheme.");
    } finally {
      setDeletingId(null);
    }
  };

  const formTitle = useMemo(
    () => (editingId ? "Edit scheme" : "Add a new scheme"),
    [editingId]
  );

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Government Schemes</p>
          <h2>Schemes &amp; Benefits</h2>
          <p className="subtitle-text">
            Add, edit, and manage the government schemes shown in the app.
          </p>
        </div>
        <div className="header-actions">
          <span className="gy-pill gy-pill-muted">
            <Landmark size={14} /> {total} total
          </span>
          <button className="gy-btn gy-btn-primary" onClick={openCreate} type="button">
            <Plus size={16} /> Add Scheme
          </button>
        </div>
      </header>

      {!authSession && (
        <div className="gy-alert gy-alert-warn">
          <AlertCircle size={16} />
          <span>Sign in as an admin to manage government schemes.</span>
        </div>
      )}
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Editor */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
        <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="gy-card-head">
            <h3>{formTitle}</h3>
            <button className="gy-icon-btn" onClick={() => setShowForm(false)} type="button">
              <X size={18} />
            </button>
          </div>
          <form className="gy-form-grid" onSubmit={handleSubmit}>
            <label className="gy-field">
              <span>Name *</span>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Pradhan Mantri Matru Vandana Yojana"
                required
              />
            </label>
            <label className="gy-field">
              <span>Short name / acronym</span>
              <input
                value={form.shortName}
                onChange={(e) => set("shortName", e.target.value)}
                placeholder="PMMVY"
              />
            </label>

            <label className="gy-field">
              <span>Type</span>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as SchemeType)}
              >
                {SCHEME_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {prettifyEnum(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="gy-field">
              <span>Government level</span>
              <select
                value={form.governmentLevel}
                onChange={(e) => set("governmentLevel", e.target.value as GovernmentLevel)}
              >
                {GOVERNMENT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {prettifyEnum(l)}
                  </option>
                ))}
              </select>
            </label>

            {form.governmentLevel === "state" && (
              <label className="gy-field">
                <span>State / UT</span>
                <input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  placeholder="Rajasthan"
                />
              </label>
            )}

            <label className="gy-field">
              <span>Primary action</span>
              <select
                value={form.actionType}
                onChange={(e) => set("actionType", e.target.value as SchemeActionType)}
              >
                {SCHEME_ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {prettifyEnum(a)}
                  </option>
                ))}
              </select>
            </label>

            <label className="gy-field">
              <span>Display order</span>
              <input
                type="number"
                value={form.order}
                onChange={(e) => set("order", e.target.value)}
                placeholder="0"
              />
            </label>

            <div className="gy-field gy-field-full">
              <span>Categories *</span>
              <div className="scheme-filter-chips">
                {SCHEME_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`type-button ${form.categories.includes(cat) ? "active" : ""}`}
                    onClick={() => toggleCategory(cat)}
                  >
                    {prettifyEnum(cat)}
                  </button>
                ))}
              </div>
            </div>

            <label className="gy-field gy-field-full">
              <span>Description *</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Short summary shown on the card and detail screen."
                required
              />
            </label>

            <label className="gy-field gy-field-full">
              <span>Benefits (one per line)</span>
              <textarea
                rows={3}
                value={form.benefits}
                onChange={(e) => set("benefits", e.target.value)}
                placeholder={"₹5,000 in installments\nFree health check-ups"}
              />
            </label>

            <label className="gy-field gy-field-full">
              <span>Eligibility criteria (one per line)</span>
              <textarea
                rows={3}
                value={form.eligibility}
                onChange={(e) => set("eligibility", e.target.value)}
                placeholder={"Pregnant or lactating woman\nAge 19 or above"}
              />
            </label>

            <label className="gy-field gy-field-full">
              <span>Documents required (one per line)</span>
              <textarea
                rows={3}
                value={form.documents}
                onChange={(e) => set("documents", e.target.value)}
                placeholder={"Aadhaar card\nBank passbook"}
              />
            </label>

            <label className="gy-field gy-field-full">
              <span>How to apply / access</span>
              <textarea
                rows={2}
                value={form.applicationMethod}
                onChange={(e) => set("applicationMethod", e.target.value)}
                placeholder="Apply at your nearest Anganwadi centre."
              />
            </label>

            <label className="gy-field">
              <span>Where to get it</span>
              <input
                value={form.whereToGet}
                onChange={(e) => set("whereToGet", e.target.value)}
                placeholder="Government hospitals, PHCs, Anganwadi centres"
              />
            </label>
            <label className="gy-field">
              <span>Helpline</span>
              <input
                value={form.helpline}
                onChange={(e) => set("helpline", e.target.value)}
                placeholder="104 / 1800-XXX-XXXX"
              />
            </label>
            <label className="gy-field">
              <span>Official website URL</span>
              <input
                type="url"
                value={form.officialUrl}
                onChange={(e) => set("officialUrl", e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="gy-field">
              <span>Source</span>
              <input
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                placeholder="Ministry of Health & Family Welfare"
              />
            </label>

            <label className="gy-field gy-field-full gy-checkbox-field">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              <span>Active — visible to users in the app</span>
            </label>

            <div className="gy-form-actions gy-field-full">
              <button
                className="gy-btn gy-btn-ghost"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button className="gy-btn gy-btn-primary" type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                {editingId ? "Save changes" : "Create scheme"}
              </button>
            </div>
          </form>
        </section>
        </div>
      )}

      {/* Search */}
      <div className="scheme-toolbar">
        <label className="scheme-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by scheme name"
          />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading schemes…</span>
        </div>
      ) : schemes.length === 0 ? (
        <div className="gy-empty">
          <Landmark size={22} />
          <span>No schemes yet. Click “Add Scheme” to create the first one.</span>
        </div>
      ) : (
        <div className="scheme-app-list">
          {schemes.map((s) => {
            const busy = deletingId === s._id;
            return (
              <div key={s._id} className="gy-card scheme-app-card">
                <div className="scheme-app-main">
                  <div className="scheme-app-info">
                    <div className="scheme-app-title-row">
                      <h3>{s.name}</h3>
                      <span className="gy-pill gy-pill-muted">{fmtLevel(s)}</span>
                      {s.shortName && (
                        <span className="gy-pill gy-pill-info">{s.shortName}</span>
                      )}
                      <span className={`gy-pill ${s.isActive ? "gy-pill-ok" : "gy-pill-muted"}`}>
                        {s.isActive ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="scheme-app-meta">
                      {prettifyEnum(s.actionType)} ·{" "}
                      {(s.categories ?? []).map(prettifyEnum).join(", ") || "No category"}
                    </p>
                    <p className="scheme-app-note">{s.description}</p>
                  </div>

                  <div className="scheme-app-actions">
                    {busy ? (
                      <Loader2 size={18} className="spin" />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="gy-btn gy-btn-ghost"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil size={15} /> Edit
                        </button>
                        <button
                          type="button"
                          className="gy-btn gy-btn-danger"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && pages > 1 && (
        <div className="scheme-pagination">
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            Previous
          </button>
          <span className="scheme-page-indicator">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={page >= pages}
            onClick={() => load(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
