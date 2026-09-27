import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Loader2, Pencil, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { HrTemplate, hrApi } from "../../api/hrApi";
import { useToast } from "../../components/Toast";
import { labelOf, useHrMeta } from "./shared";
import { SendDocumentDialog } from "./SendDocumentDialog";

// The editor pulls in pdf.js; load it only when a template is opened.
const TemplateEditor = lazy(() => import("./TemplateEditor").then((m) => ({ default: m.TemplateEditor })));

const kindLabel = (kind: HrTemplate["kind"]) => (kind === "fixed" ? "Complete design" : "Letterhead + text");

export const TemplatesPage: React.FC = () => {
  const toast = useToast();
  const { meta } = useHrMeta();
  const [templates, setTemplates] = useState<HrTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<HrTemplate | "new" | null>(null);
  const [sendWith, setSendWith] = useState<HrTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates((await hrApi.listTemplates()).templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (showArchived || t.active) &&
        (!category || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q))
    );
  }, [templates, search, category, showArchived]);

  const upsert = (t: HrTemplate) =>
    setTemplates((prev) => (prev.some((x) => x._id === t._id) ? prev.map((x) => (x._id === t._id ? t : x)) : [t, ...prev]));

  const remove = async (t: HrTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? Documents already sent keep their own PDFs.`)) return;
    try {
      await hrApi.deleteTemplate(t._id);
      setTemplates((prev) => prev.filter((x) => x._id !== t._id));
      toast.success("Template deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  };

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2>Letter Templates</h2>
          <p className="subtitle-text">
            Your Canva designs for offer letters, completion letters, certificates and anything on the letterhead. Design
            in Canva, download as PDF, upload here, then mark where each detail goes.
          </p>
        </div>
        <button type="button" className="primary-action" onClick={() => setEditing("new")}>
          <Plus size={18} /> New template
        </button>
      </div>

      {error && <div className="gy-alert gy-alert-error"><span>{error}</span></div>}

      <div className="app-filter-bar">
        <select className="app-filter-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="hr-check is-inline">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>Show archived</span>
        </label>
        <label className="scheme-search app-filter-search">
          <Search size={16} />
          <input type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty"><Loader2 className="spin-icon" size={22} /><p>Loading templates…</p></div>
      ) : filtered.length === 0 ? (
        <div className="gy-empty">
          <p>
            {templates.length
              ? "No templates match."
              : "No templates yet. In Canva, open your offer letter or certificate → Share → Download → PDF Standard, then click New template."}
          </p>
        </div>
      ) : (
        <div className="hr-template-grid">
          {filtered.map((t) => (
            <article key={t._id} className={`hr-template-card ${t.active ? "" : "is-archived"}`}>
              <div className="hr-template-top">
                <span className="gy-pill gy-pill-info">{labelOf(meta?.categories, t.category)}</span>
                {!t.active && <span className="gy-pill gy-pill-muted">Archived</span>}
              </div>
              <h3>{t.name}</h3>
              <p className="admin-user-sub">
                {kindLabel(t.kind)} · {t.pages.length} page{t.pages.length === 1 ? "" : "s"} ·{" "}
                {t.kind === "fixed" ? `${t.fields.length} field${t.fields.length === 1 ? "" : "s"}` : `${t.placeholders.length} fields in the text`}
              </p>
              {t.requiresSignature && (
                <p className="admin-user-sub hr-sign-note"><PenLine size={13} /> Collects a signature</p>
              )}
              <div className="hr-row-actions hr-template-actions">
                <button type="button" className="gy-btn gy-btn-ghost" disabled={!t.active} onClick={() => setSendWith(t)}>
                  <FilePlus2 size={14} /> Send
                </button>
                <button type="button" className="gy-btn gy-btn-ghost" onClick={() => setEditing(t)}>
                  <Pencil size={14} /> Edit
                </button>
                <button type="button" className="gy-icon-btn danger" title="Delete" onClick={() => remove(t)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Suspense fallback={<div className="modal-overlay"><Loader2 className="spin-icon" size={26} /></div>}>
          <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={upsert} />
        </Suspense>
      )}
      {sendWith && <SendDocumentDialog template={sendWith} onClose={() => setSendWith(null)} />}
    </div>
  );
};
