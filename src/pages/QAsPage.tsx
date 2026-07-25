import React, { useState, useMemo } from "react";
import { 
  FileQuestion, Search, Plus, Save, Clock, Tags, PencilLine, Trash2, Loader2, AlertCircle, CheckCircle, ShieldAlert
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { ContentItem, ContentStatus, Audience, CycleStage } from "../types/content";

const emptyQA = (): ContentItem => ({
  id: crypto.randomUUID(),
  type: "qa",
  title: "",
  status: "draft",
  audience: "All users",
  stage: "General",
  summary: "",
  body: "",
  question: "",
  answer: "",
  isSensitive: false,
  medicallyReviewed: false,
  videoUrl: "",
  tags: [],
  author: "Clinician Team",
  reviewedBy: "",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: true,
  keywords: []
});

export const QAsPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyQA());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const qas = useMemo(() => {
    return items.filter((i) => i.type === "qa");
  }, [items]);

  const filteredQas = useMemo(() => {
    const search = query.trim().toLowerCase();
    return qas.filter((qa) => {
      const matchesStatus = statusFilter === "all" || qa.status === statusFilter;
      const searchable = [
        qa.title, qa.question, qa.answer, qa.summary, qa.reviewedBy, 
        qa.stage, qa.audience, ...qa.tags
      ].join(" ").toLowerCase();
      
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [qas, query, statusFilter]);

  const updateDraft = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleEdit = (qa: ContentItem) => {
    setDraft({ ...qa });
    setEditingId(qa.id);
    setFormError(null);
  };

  const handleDelete = async (qa: ContentItem) => {
    if (window.confirm(`Are you sure you want to delete this Q&A?`)) {
      setDeletingId(qa.id);
      await deleteItem(qa.id, "qa");
      setDeletingId(null);
      if (editingId === qa.id) {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    setDraft(emptyQA());
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const question = draft.question.trim() || draft.title.trim();
    const answer = draft.answer.trim() || draft.body.trim();

    if (!question) {
      setFormError("User Question is required.");
      return;
    }
    if (!answer) {
      setFormError("Approved Answer is required.");
      return;
    }
    if (draft.medicallyReviewed && !draft.reviewedBy.trim()) {
      setFormError("Clinician name is required for medically reviewed status.");
      return;
    }

    const payload: ContentItem = {
      ...draft,
      title: question,
      question,
      answer,
      body: answer,
      summary: draft.summary.trim() || question.slice(0, 100),
      reviewedBy: draft.reviewedBy.trim(),
      updatedAt: new Date().toISOString(),
      reviewRequired: !draft.medicallyReviewed
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
      setFormError("Failed to save changes. Please try again.");
    }
  };

  return (
    <div className="workspace-page">
      <Header 
        title="Q&A Forum Management" 
        subtitle="Approve community questions and write verified clinical answers."
        actions={
          <button className="primary-action" onClick={handleReset} type="button">
            <Plus size={18} />
            New Q&A
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout">
        {/* Left list panel */}
        <div className="library-panel">
          <div className="panel-heading">
            <h3>Q&A Archive</h3>
            <span>{filteredQas.length} items shown</span>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={18} />
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by question, tags, reviewer..."
                value={query}
              />
            </label>
            <select
              onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "all")}
              value={statusFilter}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="review">Needs Medical Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="entry-list">
            {isLoading ? (
              <div className="empty-state">
                <Loader2 className="spin-icon" size={28} />
                <h4>Loading Q&As...</h4>
              </div>
            ) : filteredQas.length === 0 ? (
              <div className="empty-state">
                <FileQuestion size={28} />
                <h4>No Q&As Found</h4>
                <p>Create a new Q&A entry using the editor panel.</p>
              </div>
            ) : (
              filteredQas.map((qa) => (
                <article
                  className={editingId === qa.id ? "entry-card selected" : "entry-card"}
                  key={qa.id}
                >
                  <div className="entry-card-main">
                    <div className="entry-icon qa">
                      <FileQuestion size={18} />
                    </div>
                    <div>
                      <div className="entry-title-row">
                        <h4>{qa.question || qa.title}</h4>
                        <span className={`status-chip ${qa.status}`}>{qa.status}</span>
                      </div>
                      <p>{qa.answer || qa.summary}</p>
                      <div className="entry-meta">
                        {qa.medicallyReviewed ? (
                          <span className="badge-verified">
                            <CheckCircle size={12} /> Verified by {qa.reviewedBy || "Medical Board"}
                          </span>
                        ) : (
                          <span className="badge-review">Needs Review</span>
                        )}
                        {qa.isSensitive && (
                          <span className="badge-sensitive">
                            <ShieldAlert size={12} /> Sensitive
                          </span>
                        )}
                        <span>
                          <Tags size={14} />
                          {qa.tags.join(", ") || "No tags"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
                    <button aria-label="Edit Q&A" onClick={() => handleEdit(qa)} type="button">
                      <PencilLine size={17} />
                    </button>
                    <button
                      aria-label="Delete Q&A"
                      disabled={deletingId === qa.id}
                      onClick={() => handleDelete(qa)}
                      type="button"
                    >
                      {deletingId === qa.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        {/* Right editor panel */}
        <form className="editor-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Q&A Entry" : "Create Q&A Entry"}</h3>
            <button className="save-button" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Q&A"}
            </button>
          </div>

          {formError && (
            <div className="form-error-alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <label className="wide-field">
              User Question *
              <textarea
                onChange={(e) => updateDraft("question", e.target.value)}
                placeholder="Write the question asked by the community user..."
                required
                rows={3}
                value={draft.question}
              />
            </label>

            <label className="wide-field">
              Approved Answer *
              <textarea
                onChange={(e) => updateDraft("answer", e.target.value)}
                placeholder="Write the approved scientific/clinical response..."
                required
                rows={6}
                value={draft.answer}
              />
            </label>

            <label>
              Status
              <select
                onChange={(e) => updateDraft("status", e.target.value as ContentStatus)}
                value={draft.status}
              >
                <option value="draft">Draft</option>
                <option value="review">Needs Medical Review</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label>
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

            <label>
              Cycle Area
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
              Reviewed By (Clinician)
              <input
                onChange={(e) => updateDraft("reviewedBy", e.target.value)}
                placeholder="Dr. Sarah Johnson, OBGYN"
                value={draft.reviewedBy}
              />
            </label>

            <label className="review-toggle">
              <input
                checked={draft.medicallyReviewed}
                onChange={(e) => {
                  updateDraft("medicallyReviewed", e.target.checked);
                  updateDraft("reviewRequired", !e.target.checked);
                }}
                type="checkbox"
              />
              Medically Reviewed
            </label>

            <label className="review-toggle">
              <input
                checked={draft.isSensitive}
                onChange={(e) => updateDraft("isSensitive", e.target.checked)}
                type="checkbox"
              />
              Sensitive / Flagged Q&A
            </label>

            <label className="wide-field">
              Short List Summary
              <input
                onChange={(e) => updateDraft("summary", e.target.value)}
                placeholder="Optional snippet shown on library listings"
                value={draft.summary}
              />
            </label>

            <label className="wide-field">
              Medical Source Links (one per line)
              <textarea
                onChange={(e) => updateDraft("sourceLinks", e.target.value.split("\n").filter(Boolean))}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                rows={3}
                value={draft.sourceLinks.join("\n")}
              />
            </label>

            <label>
              Tags (comma-separated)
              <input
                onChange={(e) => updateDraft("tags", e.target.value.split(",").map(t => t.trim()))}
                placeholder="cramps, cycles, teen-health"
                value={draft.tags.join(", ")}
              />
            </label>
          </div>

          <aside className="preview-pane">
            <div className="preview-heading">
              <span className={`status-chip ${draft.status}`}>{draft.status}</span>
              <span>{draft.audience} • {draft.stage}</span>
            </div>
            <h4 className="preview-question">Q: {draft.question || "User Question"}</h4>
            <div className="preview-body answer-view">
              <strong>Answer:</strong>
              <p>{draft.answer || "Clinical response will be shown here."}</p>
              {draft.medicallyReviewed && (
                <div className="review-stamp">
                  Verified by: {draft.reviewedBy || "Medical Specialist"}
                </div>
              )}
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
};
