import React, { useState, useMemo } from "react";
import { 
  Film, Search, Plus, Save, Clock, Tags, PencilLine, Trash2, Loader2, AlertCircle, PlayCircle, BarChart3, X
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { MediaUploadField } from "../components/MediaUploadField";
import { ContentItem, ContentStatus, Audience, CycleStage } from "../types/content";

const emptyVideo = (): ContentItem => ({
  id: crypto.randomUUID(),
  type: "video",
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
  imageUrl: "",
  tags: [],
  author: "Creator Studio",
  reviewedBy: "",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: false,
  keywords: [],
  pollQuestion: "",
  pollOptions: []
});

export const VideosPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyVideo());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Local state for adding/editing a single poll option
  const [newOptionTopic, setNewOptionTopic] = useState("");

  const videos = useMemo(() => {
    return items.filter((i) => i.type === "video");
  }, [items]);

  const filteredVideos = useMemo(() => {
    const search = query.trim().toLowerCase();
    return videos.filter((video) => {
      const matchesStatus = statusFilter === "all" || video.status === statusFilter;
      const searchable = [
        video.title, video.summary, video.author, video.videoUrl,
        video.stage, video.audience, ...video.tags
      ].join(" ").toLowerCase();
      
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [videos, query, statusFilter]);

  const updateDraft = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleEdit = (video: ContentItem) => {
    setDraft({ 
      ...video,
      pollOptions: video.pollOptions || []
    });
    setEditingId(video.id);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleNew = () => {
    setDraft(emptyVideo());
    setEditingId(null);
    setFormError(null);
    setNewOptionTopic("");
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleDelete = async (video: ContentItem) => {
    if (window.confirm(`Are you sure you want to delete "${video.title}"?`)) {
      setDeletingId(video.id);
      await deleteItem(video.id, "video");
      setDeletingId(null);
      if (editingId === video.id) {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    setDraft(emptyVideo());
    setEditingId(null);
    setFormError(null);
    setNewOptionTopic("");
    setIsEditorOpen(false);
  };

  const addPollOption = () => {
    if (!newOptionTopic.trim()) return;
    const currentOptions = draft.pollOptions || [];
    const newOption = {
      optionId: `opt_${Date.now()}`,
      topic: newOptionTopic.trim(),
      votes: 0
    };
    updateDraft("pollOptions", [...currentOptions, newOption]);
    setNewOptionTopic("");
  };

  const removePollOption = (id: string) => {
    const currentOptions = draft.pollOptions || [];
    updateDraft("pollOptions", currentOptions.filter(o => o.optionId !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!draft.title.trim()) {
      setFormError("Video Title is required.");
      return;
    }
    if (!draft.videoUrl.trim()) {
      setFormError("Video Source URL is required.");
      return;
    }

    const payload: ContentItem = {
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      videoUrl: draft.videoUrl.trim(),
      author: draft.author.trim() || "Creator Studio",
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
      setFormError("Failed to save changes. Please try again.");
    }
  };

  return (
    <div className="workspace-page">
      <Header 
        title="Video Reels Studio" 
        subtitle="Manage vertical wellness video clips and interactive viewer polls."
        actions={
          <button className="primary-action" onClick={handleNew} type="button">
            <Plus size={18} />
            New Video
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout list-only">
        {/* Left list panel */}
        <div className="library-panel">
          <div className="panel-heading">
            <h3>Video Archive</h3>
            <span>{filteredVideos.length} reels shown</span>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={18} />
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, creator, URL..."
                value={query}
              />
            </label>
            <select
              onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "all")}
              value={statusFilter}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="review">Needs Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="entry-list">
            {isLoading ? (
              <div className="empty-state">
                <Loader2 className="spin-icon" size={28} />
                <h4>Loading Reels...</h4>
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="empty-state">
                <Film size={28} />
                <h4>No Videos Found</h4>
                <p>Upload a new reel using the editor panel.</p>
              </div>
            ) : (
              filteredVideos.map((video) => (
                <article
                  className={editingId === video.id ? "entry-card selected" : "entry-card"}
                  key={video.id}
                >
                  <div className="entry-card-main">
                    <div className="entry-icon video">
                      <Film size={18} />
                    </div>
                    <div>
                      <div className="entry-title-row">
                        <h4>{video.title}</h4>
                        <span className={`status-chip ${video.status}`}>{video.status}</span>
                      </div>
                      <p>{video.summary || video.videoUrl}</p>
                      <div className="entry-meta">
                        <span className="badge-url">
                          <PlayCircle size={12} /> {video.videoUrl.slice(0, 45)}...
                        </span>
                        <span>• Creator: {video.author}</span>
                        {video.pollQuestion && (
                          <span className="badge-poll">
                            <BarChart3 size={12} /> Has Poll
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
                    <button aria-label="Edit Video" onClick={() => handleEdit(video)} type="button">
                      <PencilLine size={17} />
                    </button>
                    <button
                      aria-label="Delete Video"
                      disabled={deletingId === video.id}
                      onClick={() => handleDelete(video)}
                      type="button"
                    >
                      {deletingId === video.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
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
            <h3>{editingId ? "Edit Video Reel" : "Create Video Reel"}</h3>
          </div>

          {formError && (
            <div className="form-error-alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <label className="wide-field">
              Video Title *
              <input
                onChange={(e) => updateDraft("title", e.target.value)}
                placeholder="Yoga movements for PMS relief..."
                required
                value={draft.title}
              />
            </label>

            <div className="wide-field">
              <MediaUploadField
                folder="reels"
                kind="video"
                label="Reel Video"
                onChange={(url) => updateDraft("videoUrl", url)}
                required
                value={draft.videoUrl}
              />
            </div>

            <div className="wide-field">
              <MediaUploadField
                folder="thumbnails"
                kind="image"
                label="Thumbnail Image"
                onChange={(url) => updateDraft("imageUrl", url)}
                value={draft.imageUrl || ""}
              />
            </div>

            <label>
              Status
              <select
                onChange={(e) => updateDraft("status", e.target.value as ContentStatus)}
                value={draft.status}
              >
                <option value="draft">Draft</option>
                <option value="review">Needs Review</option>
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
              Cycle Category
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
              Creator Name
              <input
                onChange={(e) => updateDraft("author", e.target.value)}
                placeholder="e.g. Dr. Priya Sharma"
                value={draft.author}
              />
            </label>

            <label className="wide-field">
              Brief Script/Summary
              <textarea
                onChange={(e) => updateDraft("summary", e.target.value)}
                placeholder="Brief description or script details..."
                rows={3}
                value={draft.summary}
              />
            </label>

            <label className="wide-field">
              Tags (comma-separated)
              <input
                onChange={(e) => updateDraft("tags", e.target.value.split(",").map(t => t.trim()))}
                placeholder="yoga, period-pain, wellness"
                value={draft.tags.join(", ")}
              />
            </label>

            {/* Interactive Video Poll Manager */}
            <div className="wide-field section-divider">
              <h4>Reel Poll (Optional)</h4>
            </div>

            <label className="wide-field">
              Poll Question
              <input
                onChange={(e) => updateDraft("pollQuestion", e.target.value)}
                placeholder="What should our next video cover?"
                value={draft.pollQuestion || ""}
              />
            </label>

            {draft.pollQuestion && (
              <div className="wide-field poll-options-manager">
                <h5>Poll Choices</h5>
                <div className="poll-options-list">
                  {(draft.pollOptions || []).map((opt) => (
                    <div key={opt.optionId} className="poll-option-row">
                      <span className="opt-topic">{opt.topic}</span>
                      <span className="opt-votes">{opt.votes || 0} votes</span>
                      <button 
                        className="btn-remove-opt" 
                        onClick={() => removePollOption(opt.optionId)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="add-option-row">
                  <input
                    onChange={(e) => setNewOptionTopic(e.target.value)}
                    placeholder="Enter poll choice..."
                    value={newOptionTopic}
                  />
                  <button onClick={addPollOption} className="btn-add-opt" type="button">
                    <Plus size={16} /> Add Choice
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="preview-pane">
            <div className="preview-heading">
              <span className={`status-chip ${draft.status}`}>{draft.status}</span>
              <span>{draft.audience}</span>
            </div>
            {draft.imageUrl && (
              <img alt="" className="preview-cover-image" src={draft.imageUrl} />
            )}
            <h4>{draft.title || "Untitled Video"}</h4>
            {draft.videoUrl ? (
              <div className="video-url-preview">
                <strong>Source:</strong> <code>{draft.videoUrl}</code>
              </div>
            ) : (
              <div className="video-url-preview empty">No Video Source Set</div>
            )}
            
            {draft.pollQuestion && (
              <div className="preview-poll-card">
                <strong>Poll: {draft.pollQuestion}</strong>
                <div className="preview-options">
                  {(draft.pollOptions || []).map((o) => (
                    <div key={o.optionId} className="preview-opt">
                      <span>{o.topic}</span>
                      <span>{o.votes || 0} votes</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div className="modal-footer">
            <button className="modal-cancel" onClick={closeEditor} type="button">
              Cancel
            </button>
            <button className="save-button" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Reel"}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
};
