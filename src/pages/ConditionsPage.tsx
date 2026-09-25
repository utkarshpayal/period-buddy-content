import React, { useState, useMemo } from "react";
import { 
  Heart, Search, Plus, Save, PencilLine, Trash2, Loader2, AlertCircle, Sparkles, Activity, X
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { PendingBadge } from "../components/PendingBadge";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { MediaUploadField } from "../components/MediaUploadField";
import { ContentItem, ContentStatus, Audience, CycleStage } from "../types/content";

const emptyCondition = (): ContentItem => ({
  id: crypto.randomUUID(),
  type: "issue",
  title: "",
  status: "draft",
  audience: "All users",
  stage: "General",
  summary: "",
  body: "",
  question: "",
  answer: "",
  isSensitive: false,
  medicallyReviewed: true,
  videoUrl: "",
  imageUrl: "",
  tags: [],
  author: "Medical Advisory Board",
  reviewedBy: "Dr. Sarah Chen, OBGYN",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: false,
  keywords: [],
  
  // Custom HealthIssue fields
  color: "#ef4444",
  icon: "alert-circle-outline",
  order: 1,
  symptoms: [],
  causes: [],
  treatment: "",
  prevention: "",
  whenToSeeDoctor: ""
});

export const ConditionsPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyCondition());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const conditions = useMemo(() => {
    return items.filter((i) => i.type === "issue");
  }, [items]);

  const filteredConditions = useMemo(() => {
    const search = query.trim().toLowerCase();
    return conditions.filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const searchable = [
        c.title, c.summary, c.body, c.stage, c.icon || ""
      ].join(" ").toLowerCase();
      
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [conditions, query, statusFilter]);

  const updateDraft = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleEdit = (condition: ContentItem) => {
    setDraft({ 
      ...condition,
      symptoms: condition.symptoms || [],
      causes: condition.causes || []
    });
    setEditingId(condition.id);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleNew = () => {
    setDraft(emptyCondition());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleDelete = async (condition: ContentItem) => {
    if (window.confirm(`Are you sure you want to delete "${condition.title}"?`)) {
      setDeletingId(condition.id);
      await deleteItem(condition.id, "issue");
      setDeletingId(null);
      if (editingId === condition.id) {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    setDraft(emptyCondition());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!draft.title.trim()) {
      setFormError("Condition Title is required.");
      return;
    }
    if (!draft.summary.trim()) {
      setFormError("Summary is required.");
      return;
    }

    const payload: ContentItem = {
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      updatedAt: new Date().toISOString()
    };

    let success = false;
    if (editingId) {
      success = await updateItem(editingId, payload);
    } else {
      success = await createItem(payload);
    }

    if (success) {
      handleReset();
    } else {
      setFormError("Failed to save condition. Please check fields.");
    }
  };

  return (
    <div className="workspace-page">
      <Header 
        title="Health Conditions Directory" 
        subtitle="Manage detailed medical profiles, causes, treatments, and clinical advice for gynecological issues."
        actions={
          <button className="primary-action" onClick={handleNew} type="button">
            <Plus size={18} />
            New Condition
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout list-only">
        {/* Left list panel */}
        <div className="library-panel">
          <div className="panel-heading">
            <h3>Health Conditions</h3>
            <span>{filteredConditions.length} conditions shown</span>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={18} />
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category..."
                value={query}
              />
            </label>
            <select
              onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "all")}
              value={statusFilter}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="entry-list">
            {isLoading ? (
              <div className="empty-state">
                <Loader2 className="spin-icon" size={28} />
                <h4>Loading Conditions...</h4>
              </div>
            ) : filteredConditions.length === 0 ? (
              <div className="empty-state">
                <Activity size={28} />
                <h4>No Conditions Found</h4>
                <p>Create a new condition profile using the editor panel.</p>
              </div>
            ) : (
              filteredConditions.map((condition) => (
                <article
                  className={editingId === condition.id ? "entry-card selected" : "entry-card"}
                  key={condition.id}
                  style={{ borderLeft: `4px solid ${condition.color || "#ccc"}` }}
                >
                  <div className="entry-card-main">
                    <div className="entry-icon condition" style={{ color: condition.color }}>
                      <Activity size={18} />
                    </div>
                    <div>
                      <div className="entry-title-row">
                        <h4>{condition.title}</h4>
                        <span className={`status-chip ${condition.status}`}>{condition.status}</span>
                        <PendingBadge id={condition.id} />
                      </div>
                      <p>{condition.summary}</p>
                      <div className="entry-meta">
                        <span className="badge-category">
                          Category: {condition.stage}
                        </span>
                        {condition.order !== undefined && <span>Order: {condition.order}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
                    <button aria-label="Edit Condition" onClick={() => handleEdit(condition)} type="button">
                      <PencilLine size={17} />
                    </button>
                    <button
                      aria-label="Delete Condition"
                      disabled={deletingId === condition.id}
                      onClick={() => handleDelete(condition)}
                      type="button"
                    >
                      {deletingId === condition.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

      </div>

      {isEditorOpen && (
        <div className="modal-overlay" onClick={closeEditor}>
        <form className="editor-panel modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
          <button aria-label="Close" className="modal-close" onClick={closeEditor} type="button">
            <X size={18} />
          </button>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Condition Details" : "Create Condition"}</h3>
          </div>

          {formError && (
            <div className="form-error-alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <label className="wide-field">
              Condition Title *
              <input
                onChange={(e) => updateDraft("title", e.target.value)}
                placeholder="Polycystic Ovary Syndrome (PCOS)..."
                required
                value={draft.title}
              />
            </label>

            <label>
              Category / Stage
              <select
                onChange={(e) => updateDraft("stage", e.target.value as CycleStage)}
                value={draft.stage}
              >
                <option value="General">General</option>
                <option value="Period">Period</option>
                <option value="PMS">PMS</option>
                <option value="Ovulation">Ovulation</option>
                <option value="Tracking">Tracking</option>
                <option value="Wellness">Wellness</option>
                <option value="Emergency">Emergency</option>
              </select>
            </label>

            <label>
              Status
              <select
                onChange={(e) => updateDraft("status", e.target.value as ContentStatus)}
                value={draft.status}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label>
              Theme Color (Hex)
              <div className="color-picker-wrapper">
                <input
                  onChange={(e) => updateDraft("color", e.target.value)}
                  type="color"
                  value={draft.color || "#ef4444"}
                />
                <input
                  className="color-hex-text"
                  onChange={(e) => updateDraft("color", e.target.value)}
                  placeholder="#ef4444"
                  value={draft.color || ""}
                />
              </div>
            </label>

            <label>
              Icon Tag
              <select
                onChange={(e) => updateDraft("icon", e.target.value)}
                value={draft.icon || "alert-circle-outline"}
              >
                <option value="alert-circle-outline">Alert Circle</option>
                <option value="medical-outline">Medical Cross</option>
                <option value="pulse-outline">Pulse / Heart Rate</option>
                <option value="shield-outline">Shield</option>
                <option value="thermometer-outline">Thermometer</option>
              </select>
            </label>

            <label>
              Display Order
              <input
                min={0}
                onChange={(e) => updateDraft("order", Number(e.target.value) || 0)}
                type="number"
                value={draft.order !== undefined ? draft.order : 1}
              />
            </label>

            <div className="wide-field">
              <MediaUploadField
                folder="thumbnails"
                kind="image"
                label="Cover Image"
                onChange={(url) => updateDraft("imageUrl", url)}
                value={draft.imageUrl || ""}
              />
            </div>

            <label className="wide-field">
              Short Description *
              <textarea
                onChange={(e) => updateDraft("summary", e.target.value)}
                placeholder="A science-backed summary shown to users on their feed."
                required
                rows={2}
                value={draft.summary}
              />
            </label>

            <label className="wide-field">
              Full Guide / Overview *
              <textarea
                onChange={(e) => updateDraft("body", e.target.value)}
                placeholder="Detailed medical overview of the condition..."
                required
                rows={5}
                value={draft.body}
              />
            </label>

            <label className="wide-field">
              Symptoms (one per line)
              <textarea
                onChange={(e) => updateDraft("symptoms", e.target.value.split("\n").filter(Boolean))}
                placeholder="Irregular or missed periods&#10;Excess body hair (hirsutism)&#10;Severe pelvic cramps"
                rows={3}
                value={(draft.symptoms || []).join("\n")}
              />
            </label>

            <label className="wide-field">
              Potential Causes (one per line)
              <textarea
                onChange={(e) => updateDraft("causes", e.target.value.split("\n").filter(Boolean))}
                placeholder="Hormonal imbalances&#10;Insulin resistance&#10;Genetics and family history"
                rows={3}
                value={(draft.causes || []).join("\n")}
              />
            </label>

            <label className="wide-field">
              Treatment Options
              <textarea
                onChange={(e) => updateDraft("treatment", e.target.value)}
                placeholder="Describe common medical treatments, lifestyle changes, and medications..."
                rows={4}
                value={draft.treatment || ""}
              />
            </label>

            <label className="wide-field">
              Prevention Tips
              <textarea
                onChange={(e) => updateDraft("prevention", e.target.value)}
                placeholder="Provide tips for reducing risk factors or managing symptom severity..."
                rows={3}
                value={draft.prevention || ""}
              />
            </label>

            <label className="wide-field">
              When to Consult a Doctor
              <textarea
                onChange={(e) => updateDraft("whenToSeeDoctor", e.target.value)}
                placeholder="Urgent warning triggers or symptoms requiring professional medical care..."
                rows={3}
                value={draft.whenToSeeDoctor || ""}
              />
            </label>
          </div>

          <aside className="preview-pane" style={{ borderLeft: `5px solid ${draft.color}` }}>
            <div className="preview-heading">
              <span className={`status-chip ${draft.status}`}>{draft.status}</span>
              <span style={{ color: draft.color }}>Health issue</span>
            </div>
            {draft.imageUrl && (
              <img alt="" className="preview-cover-image" src={draft.imageUrl} />
            )}
            <h4>{draft.title || "Untitled Condition"}</h4>
            <p className="preview-summary">{draft.summary || "No summary written."}</p>
            
            {draft.body && (
              <div className="preview-overview">
                <strong>Overview:</strong>
                <p>{draft.body}</p>
              </div>
            )}

            {draft.symptoms && draft.symptoms.length > 0 && (
              <div className="preview-symptoms-list">
                <strong>Key Symptoms:</strong>
                <ul>
                  {draft.symptoms.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          <div className="modal-footer">
            <button className="modal-cancel" onClick={closeEditor} type="button">
              Cancel
            </button>
            <button className="save-button" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Condition"}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
};
