import React, { useState, useMemo } from "react";
import { 
  BookOpen, Search, Plus, Save, PencilLine, Trash2, Loader2, AlertCircle, Leaf, Sparkles, Heart, X,
  Droplet, ShieldCheck, LayoutGrid, CheckCircle2, PlayCircle, Headphones
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { PendingBadge } from "../components/PendingBadge";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { ReviewChip, StatusActions, StatusTabs, statusLabel, useCanPublish } from "../components/ContentStatusControls";
import { MediaUploadField } from "../components/MediaUploadField";
import { ContentItem, ContentStatus, Audience, CycleStage, ContentType } from "../types/content";
import { uid } from "../lib/uid";

const emptyGuide = (): ContentItem => ({
  id: uid(),
  type: "guide",
  title: "",
  status: "draft",
  audience: "All users",
  stage: "Wellness",
  summary: "",
  body: "",
  question: "",
  answer: "",
  isSensitive: false,
  medicallyReviewed: false,
  videoUrl: "",
  tags: [],
  author: "Wellbeing Desk",
  reviewedBy: "",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: false,
  keywords: [],
  
  // Custom WellbeingResource fields
  color: "#d946a6",
  icon: "heart-outline",
  order: 1,
  itemsCount: 5,
  estimatedReadTime: 3,
  audioUrl: "",
  extendedGuide: []
});

/** The Ionicons names the Icon Tag picker offers, drawn with their closest lucide twin for the preview. */
const PREVIEW_ICONS: Record<string, LucideIcon> = {
  "heart-outline": Heart,
  "water-outline": Droplet,
  "leaf-outline": Leaf,
  "shield-checkmark-outline": ShieldCheck,
  "apps-outline": LayoutGrid,
  "book-outline": BookOpen,
};

/**
 * Mirrors the app's Sexual Wellbeing screen (The-Nura-App
 * app/(app)/sexual-wellbeing.tsx): the guide as a row in the "Read" list,
 * then the detail sheet's "What to know" points.
 */
const WellbeingAppPreview: React.FC<{ draft: ContentItem }> = ({ draft }) => {
  const Icon = PREVIEW_ICONS[draft.icon || ""] ?? BookOpen;
  const color = /^#[0-9a-f]{6}$/i.test(draft.color || "") ? draft.color! : "#d946a6";
  const points = draft.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const guidePoints = points.length > 0 ? points : draft.summary ? [draft.summary] : [];
  const meta = [
    draft.estimatedReadTime ? `${draft.estimatedReadTime} min read` : null,
    `${guidePoints.length} key ${guidePoints.length === 1 ? "point" : "points"}`,
  ].filter(Boolean).join("  ·  ");
  return (
    <div className="wb-preview">
      <span className="wb-preview-label">In the app · Read list</span>
      <div className="wb-row">
        <div className="wb-cover" style={{ background: `${color}22` }}>
          <Icon size={22} color={color} />
        </div>
        <div className="wb-row-text">
          <strong>{draft.title || "Untitled guide"}</strong>
          <p>{draft.summary || "Your summary shows here, up to two lines."}</p>
          <span className="wb-meta">
            {meta}
            {draft.videoUrl ? <PlayCircle size={13} /> : null}
            {draft.audioUrl ? <Headphones size={13} /> : null}
          </span>
        </div>
      </div>

      <span className="wb-preview-label">In the app · Detail sheet</span>
      <div className="wb-sheet">
        <div className="wb-sheet-head">
          <div className="wb-cover is-small" style={{ background: `${color}22` }}>
            <Icon size={18} color={color} />
          </div>
          <strong>{draft.title || "Untitled guide"}</strong>
        </div>
        <p className="wb-sheet-summary">{draft.summary || "No summary written."}</p>
        <span className="wb-section">What to know</span>
        <ul className="wb-points">
          {guidePoints.length === 0 ? <li className="is-empty">Add guide points, one per line.</li> : null}
          {guidePoints.map((line, idx) => (
            <li key={idx}>
              <CheckCircle2 size={16} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export const GuidesPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  // Writers without publish rights submit for medical review instead.
  const canPublish = useCanPublish();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyGuide());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const guides = useMemo(() => {
    return items.filter((i) => i.type === "guide" || i.type === "tip");
  }, [items]);

  const filteredGuides = useMemo(() => {
    const search = query.trim().toLowerCase();
    return guides.filter((g) => {
      const matchesStatus = statusFilter === "all" || g.status === statusFilter;
      const searchable = [
        g.title, g.summary, g.body, g.type, g.icon || ""
      ].join(" ").toLowerCase();
      
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [guides, query, statusFilter]);

  const updateDraft = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleEdit = (guide: ContentItem) => {
    // If extendedGuide is empty, populate from body split by newlines
    const extendedGuide = guide.extendedGuide && guide.extendedGuide.length > 0
      ? guide.extendedGuide
      : (guide.body ? guide.body.split("\n").filter(Boolean) : []);
    
    setDraft({ 
      ...guide, 
      extendedGuide,
      body: guide.body || extendedGuide.join("\n")
    });
    setEditingId(guide.id);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleNew = () => {
    setDraft(emptyGuide());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleDelete = async (guide: ContentItem) => {
    if (window.confirm(`Are you sure you want to delete "${guide.title}"?`)) {
      setDeletingId(guide.id);
      await deleteItem(guide.id, guide.type);
      setDeletingId(null);
      if (editingId === guide.id) {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    setDraft(emptyGuide());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!draft.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!draft.summary.trim()) {
      setFormError("Summary is required.");
      return;
    }

    const lines = draft.body.split("\n").map(l => l.trim()).filter(Boolean);

    const payload: ContentItem = {
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      body: lines.join("\n"),
      extendedGuide: lines,
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
      setFormError("Failed to save wellbeing resource. Please check fields.");
    }
  };

  return (
    <div className="workspace-page">
      <Header 
        title="Wellbeing & Hygiene Guides" 
        subtitle="Manage wellness guides, preventive tips, contraception matrices, and hygiene habits."
        actions={
          <button className="primary-action" onClick={handleNew} type="button">
            <Plus size={18} />
            New Guide
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout list-only">
        {/* Left list panel */}
        <div className="library-panel">
          <div className="panel-heading">
            <h3>Resources Archive</h3>
            <span>{filteredGuides.length} items shown</span>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={18} />
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category, description..."
                value={query}
              />
            </label>
          </div>
          <StatusTabs type="guide" items={guides} value={statusFilter} onChange={setStatusFilter} />

          <div className="entry-list">
            {isLoading ? (
              <div className="empty-state">
                <Loader2 className="spin-icon" size={28} />
                <h4>Loading Resources...</h4>
              </div>
            ) : filteredGuides.length === 0 ? (
              <div className="empty-state">
                <BookOpen size={28} />
                <h4>No Resources Found</h4>
                <p>Create a new wellbeing guide using the editor panel.</p>
              </div>
            ) : (
              filteredGuides.map((guide) => (
                <article
                  className={editingId === guide.id ? "entry-card selected" : "entry-card"}
                  key={guide.id}
                  style={{ borderLeft: `4px solid ${guide.color || "#ccc"}` }}
                >
                  <div className="entry-card-main">
                    <div className="entry-icon guide" style={{ color: guide.color }}>
                      {guide.type === "tip" ? <Sparkles size={18} /> : <Leaf size={18} />}
                    </div>
                    <div>
                      <div className="entry-title-row">
                        <h4>{guide.title}</h4>
                        <span className={`status-chip ${guide.status}`}>{statusLabel(guide.status)}</span>
                        <PendingBadge id={guide.id} />
                        <ReviewChip item={guide} />
                      </div>
                      <p>{guide.summary}</p>
                      <div className="entry-meta">
                        <span className="badge-type-wellbeing">
                          Type: {guide.type === "tip" ? "Sexual Wellbeing" : "Hygiene"}
                        </span>
                        <span>Estimated Read: {guide.estimatedReadTime || guide.readTimeMinutes || 0} mins</span>
                        {guide.order !== undefined && <span>Order: {guide.order}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
                    <StatusActions item={guide} />
                    <button aria-label="Edit Guide" onClick={() => handleEdit(guide)} type="button">
                      <PencilLine size={17} />
                    </button>
                    <button
                      aria-label="Delete Guide"
                      disabled={deletingId === guide.id}
                      onClick={() => handleDelete(guide)}
                      type="button"
                    >
                      {deletingId === guide.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
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
            <h3>{editingId ? "Edit Resource" : "Create Resource"}</h3>
          </div>

          {formError && (
            <div className="form-error-alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <label className="wide-field">
              Resource Title *
              <input
                onChange={(e) => updateDraft("title", e.target.value)}
                placeholder="Intimacy & Periods / Intimate Hygiene 101..."
                required
                value={draft.title}
              />
            </label>

            <label>
              Category Type *
              <select
                onChange={(e) => updateDraft("type", e.target.value as ContentType)}
                value={draft.type}
              >
                <option value="guide">Hygiene</option>
                <option value="tip">Sexual Wellbeing</option>
              </select>
            </label>

            <label>
              Status
              <select
                onChange={(e) => updateDraft("status", e.target.value as ContentStatus)}
                disabled={draft.status === "review"}
                title={draft.status === "review" ? "Waiting for medical review: use the row's review actions" : undefined}
                value={draft.status}
              >
                {draft.status === "review" && <option value="review">In medical review</option>}
                <option value="draft">Draft</option>
                {(canPublish || draft.status === "published") && (
                  <option disabled={!canPublish} value="published">Published</option>
                )}
              </select>
            </label>

            <label>
              Theme Color (Hex)
              <div className="color-picker-wrapper">
                <input
                  onChange={(e) => updateDraft("color", e.target.value)}
                  type="color"
                  value={draft.color || "#d946a6"}
                />
                <input
                  className="color-hex-text"
                  onChange={(e) => updateDraft("color", e.target.value)}
                  placeholder="#ffffff"
                  value={draft.color || ""}
                />
              </div>
            </label>

            <label>
              Icon Tag
              <select
                onChange={(e) => updateDraft("icon", e.target.value)}
                value={draft.icon || "heart-outline"}
              >
                <option value="heart-outline">Heart</option>
                <option value="water-outline">Water/Drop</option>
                <option value="leaf-outline">Leaf/Green</option>
                <option value="shield-checkmark-outline">Shield/Protection</option>
                <option value="apps-outline">Grid/Matrix</option>
                <option value="book-outline">Book</option>
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

            <label className="wide-field">
              Brief Summary *
              <textarea
                onChange={(e) => updateDraft("summary", e.target.value)}
                placeholder="A science-backed summary shown to users on their feed."
                required
                rows={2}
                value={draft.summary}
              />
            </label>

            <label className="wide-field">
              Extended Guide Points (One point per line) *
              <textarea
                onChange={(e) => updateDraft("body", e.target.value)}
                placeholder="Discuss comfort levels before touching...&#10;Endorphins act as natural painkillers...&#10;Place a towel down to avoid stains..."
                required
                rows={6}
                value={draft.body}
              />
            </label>

            <label className="wide-field">
              Target Audience
              <select
                onChange={(e) => updateDraft("audience", e.target.value as Audience)}
                value={draft.audience}
              >
                <option value="All users">All users</option>
                <option value="Teens">Teens</option>
                <option value="Adults">Adults</option>
                <option value="Parents">Parents</option>
                <option value="Partners">Partners</option>
              </select>
            </label>

            <div className="wide-field section-divider">
              <h4>Audio & Video Companion (Optional)</h4>
            </div>

            <div>
              <MediaUploadField
                folder="audio"
                kind="audio"
                label="Audio Guide"
                onChange={(url) => updateDraft("audioUrl", url)}
                value={draft.audioUrl || ""}
              />
            </div>

            <div>
              <MediaUploadField
                folder="reels"
                kind="video"
                label="Video Companion"
                onChange={(url) => updateDraft("videoUrl", url)}
                value={draft.videoUrl || ""}
              />
            </div>
          </div>

          {draft.type === "tip" ? (
            <aside className="preview-pane">
              <div className="preview-heading">
                <span className={`status-chip ${draft.status}`}>{statusLabel(draft.status)}</span>
                <ReviewChip item={draft} />
                <span style={{ color: draft.color }}>Sexual Wellbeing</span>
              </div>
              <WellbeingAppPreview draft={draft} />
            </aside>
          ) : (
            <aside className="preview-pane" style={{ borderLeft: `5px solid ${draft.color}` }}>
              <div className="preview-heading">
                <span className={`status-chip ${draft.status}`}>{statusLabel(draft.status)}</span>
                <ReviewChip item={draft} />
                <span style={{ color: draft.color }}>
                  Hygiene
                </span>
              </div>
              <h4>{draft.title || "Untitled Wellbeing Resource"}</h4>
              <p className="preview-summary">{draft.summary || "No summary written."}</p>
              
              <div className="preview-extended-list">
                <strong>Extended Guide:</strong>
                <ul>
                  {draft.body.split("\n").filter(Boolean).map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>
            </aside>
          )}

          <div className="modal-footer">
            <button className="modal-cancel" onClick={closeEditor} type="button">
              Cancel
            </button>
            <button className="save-button" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Guide"}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
};
