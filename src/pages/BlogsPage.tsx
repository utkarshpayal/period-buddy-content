import React, { useState, useMemo } from "react";
import { 
  FileText, Search, Plus, Save, Clock, Tags, PencilLine, Trash2, Loader2, BookOpen, AlertCircle, X, Eye
} from "lucide-react";

/** "3m 20s" for an average read time in seconds. */
function formatSeconds(seconds: number) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 60)}m`;
}
import { useAppContext } from "../context/AppContext";
import { PendingBadge } from "../components/PendingBadge";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { MediaUploadField } from "../components/MediaUploadField";
import { RichPreview, RichTextEditor } from "../components/richText";
import { ReviewChip, StatusActions, StatusTabs, statusLabel, useCanPublish } from "../components/ContentStatusControls";
import { BLOG_CATEGORIES, estimateReadMinutes } from "../api/contentApi";
import { ContentItem, ContentStatus, Audience } from "../types/content";
import { uid } from "../lib/uid";
import { useUnsavedChanges, useUploadGuard } from "../lib/useEditorGuards";
import { richTextToPlain } from "../lib/richText";

const emptyBlog = (): ContentItem => ({
  id: uid(),
  type: "blog",
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
  imageUrl: "",
  tags: [],
  author: "Content Team",
  reviewedBy: "",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: false,
  category: "general",
  seoTitle: "",
  seoDescription: "",
  keywords: []
});

export const BlogsPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  // Writers without publish rights submit for medical review instead.
  const canPublish = useCanPublish();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyBlog());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const blogs = useMemo(() => {
    return items.filter((i) => i.type === "blog");
  }, [items]);

  const filteredBlogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    return blogs.filter((blog) => {
      const matchesStatus = statusFilter === "all" || blog.status === statusFilter;
      const searchable = [
        blog.title, blog.summary, blog.body, blog.author, 
        blog.stage, blog.audience, ...blog.tags
      ].join(" ").toLowerCase();
      
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [blogs, query, statusFilter]);

  const updateDraft = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleEdit = (blog: ContentItem) => {
    setDraft({ ...blog });
    setEditingId(blog.id);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleNew = () => {
    setDraft(emptyBlog());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const { uploading, report } = useUploadGuard();
  const confirmDiscard = useUnsavedChanges(draft, isEditorOpen);

  const closeEditor = () => {
    if (!confirmDiscard()) return;
    setIsEditorOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleDelete = async (blog: ContentItem) => {
    if (window.confirm(`Are you sure you want to delete "${blog.title}"?`)) {
      setDeletingId(blog.id);
      await deleteItem(blog.id, "blog");
      setDeletingId(null);
      if (editingId === blog.id) {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    setDraft(emptyBlog());
    setEditingId(null);
    setFormError(null);
    setIsEditorOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) {
      setFormError("Images are still uploading. Save once they finish.");
      return;
    }
    setFormError(null);

    if (!draft.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!draft.body.trim()) {
      setFormError("Blog body content is required.");
      return;
    }

    const payload: ContentItem = {
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      body: draft.body.trim(),
      author: draft.author.trim() || "Content Team",
      seoTitle: draft.seoTitle?.trim() || "",
      seoDescription: draft.seoDescription?.trim() || "",
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
        title="Manage Blogs & Articles" 
        subtitle="Publish educational and lifestyle contents for the core user feed."
        actions={
          <button className="primary-action" onClick={handleNew} type="button">
            <Plus size={18} />
            New Blog
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout list-only">
        {/* Full-width list panel */}
        <div className="library-panel">
          <div className="panel-heading">
            <h3>Blog Archive</h3>
            <span>{filteredBlogs.length} items shown</span>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={18} />
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author, tags..."
                value={query}
              />
            </label>
          </div>
          <StatusTabs type="blog" items={blogs} value={statusFilter} onChange={setStatusFilter} />

          <div className="entry-list">
            {isLoading ? (
              <div className="empty-state">
                <Loader2 className="spin-icon" size={28} />
                <h4>Loading Blogs...</h4>
              </div>
            ) : filteredBlogs.length === 0 ? (
              <div className="empty-state">
                <FileText size={28} />
                <h4>No Blogs Found</h4>
                <p>Add a new blog post using the editor panel.</p>
              </div>
            ) : (
              filteredBlogs.map((blog) => (
                <article
                  className={editingId === blog.id ? "entry-card selected" : "entry-card"}
                  key={blog.id}
                >
                  <div className="entry-card-main">
                    <div className="entry-icon blog">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="entry-title-row">
                        <h4>{blog.title}</h4>
                        <span className={`status-chip ${blog.status}`}>{statusLabel(blog.status)}</span>
                        <PendingBadge id={blog.id} />
                        <ReviewChip item={blog} />
                      </div>
                      <p>{blog.summary || richTextToPlain(blog.body)}</p>
                      <div className="entry-meta">
                        <span>
                          <Clock size={14} />
                          {blog.readStats?.averageReadSeconds
                            ? `${formatSeconds(blog.readStats.averageReadSeconds)} read (real) · est. ${blog.readTimeMinutes || 1} min`
                            : blog.readTimeMinutes
                              ? `${blog.readTimeMinutes} min read (est.)`
                              : "Read time on save"}
                        </span>
                        {blog.readStats && blog.readStats.reads > 0 ? (
                          <span title="Real reading in the app: unique readers, average active time on screen per visit, and the share of readers who reached the end">
                            <Eye size={14} />
                            {blog.readStats.reads} {blog.readStats.reads === 1 ? "reader" : "readers"}
                            {blog.readStats.visits > blog.readStats.reads ? ` (${blog.readStats.visits} visits)` : ""}
                            {blog.readStats.completionRate != null ? ` · ${Math.round(blog.readStats.completionRate * 100)}% finished` : ""}
                          </span>
                        ) : (
                          <span>
                            <Eye size={14} />
                            No reads yet
                          </span>
                        )}
                        <span>
                          <Tags size={14} />
                          {blog.tags.join(", ") || "No tags"}
                        </span>
                        <span>• By {blog.author}</span>
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
                    <StatusActions item={blog} />
                    <button aria-label="Edit Blog" onClick={() => handleEdit(blog)} type="button">
                      <PencilLine size={17} />
                    </button>
                    <button
                      aria-label="Delete Blog"
                      disabled={deletingId === blog.id}
                      onClick={() => handleDelete(blog)}
                      type="button"
                    >
                      {deletingId === blog.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
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
            <h3>{editingId ? "Edit Blog Post" : "Create Blog Post"}</h3>
          </div>

          {formError && (
            <div className="form-error-alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <label className="wide-field">
              Blog Title *
              <input
                onChange={(e) => updateDraft("title", e.target.value)}
                placeholder="How to track period symptoms..."
                required
                value={draft.title}
              />
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
              Category
              <select
                onChange={(e) => updateDraft("category", e.target.value)}
                value={draft.category || "general"}
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                {draft.category && !BLOG_CATEGORIES.some((c) => c.value === draft.category) && (
                  <option value={draft.category}>{draft.category} (old category, kept as is)</option>
                )}
              </select>
            </label>

            <label>
              Reading Time
              <input
                readOnly
                title="Calculated by the server from the article (about 200 words a minute)"
                value={
                  draft.body.trim()
                    ? `Auto · about ${estimateReadMinutes(richTextToPlain(draft.body))} min`
                    : "Auto · calculated from the content"
                }
              />
            </label>

            <label className="wide-field">
              Excerpt / Brief Summary *
              <textarea
                onChange={(e) => updateDraft("summary", e.target.value)}
                placeholder="A short description shown on cards and listings."
                required
                rows={2}
                value={draft.summary}
              />
            </label>

            <div className="wide-field rte-field">
              <span className="rte-field-label">Article Content *</span>
              <RichTextEditor
                label="Article content"
                onBusyChange={report("Article content")}
                onChange={(body) => updateDraft("body", body)}
                placeholder="Write the article. Use the toolbar to add headings, colors, images, tables and charts."
                value={draft.body}
                variant="full"
              />
            </div>

            <label>
              Author Name
              <input
                onChange={(e) => updateDraft("author", e.target.value)}
                placeholder="e.g. Dr. Sarah Chen"
                value={draft.author}
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

            <label>
              Tags (comma-separated)
              <input
                onChange={(e) => updateDraft("tags", e.target.value.split(",").map(t => t.trim()))}
                placeholder="wellness, hormones, pcos"
                value={draft.tags.join(", ")}
              />
            </label>

            <div className="wide-field section-divider">
              <h4>SEO & Metadata</h4>
            </div>

            <label className="wide-field">
              SEO Optimized Title
              <input
                onChange={(e) => updateDraft("seoTitle", e.target.value)}
                placeholder="Defaults to title if left blank"
                value={draft.seoTitle || ""}
              />
            </label>

            <label className="wide-field">
              SEO Meta Description (max 160 chars)
              <textarea
                onChange={(e) => updateDraft("seoDescription", e.target.value)}
                placeholder="Brief summary that search engines show in search results."
                rows={2}
                value={draft.seoDescription || ""}
              />
            </label>

            <label className="wide-field">
              Keywords (comma-separated)
              <input
                onChange={(e) => updateDraft("keywords", e.target.value.split(",").map(k => k.trim()))}
                placeholder="period cycle, tracking symptoms, wellness"
                value={draft.keywords?.join(", ") || ""}
              />
            </label>
          </div>

          <aside className="preview-pane">
            <div className="preview-heading">
              <span className={`status-chip ${draft.status}`}>{statusLabel(draft.status)}</span>
              <ReviewChip item={draft} />
              <span>
                {draft.audience} • {BLOG_CATEGORIES.find((c) => c.value === draft.category)?.label ?? draft.category ?? "General"}
              </span>
            </div>
            {draft.imageUrl && (
              <img loading="lazy" decoding="async" alt="" className="preview-cover-image" src={draft.imageUrl} />
            )}
            <h4>{draft.title || "Untitled Blog Post"}</h4>
            <p className="preview-summary">{draft.summary || "No summary written."}</p>
            <div className="preview-body preview-rich">
              <RichPreview content={draft.body} empty="Start writing the article to see it here." />
            </div>
          </aside>

          <div className="modal-footer">
            <button className="modal-cancel" onClick={closeEditor} type="button">
              Cancel
            </button>
            <button className="save-button" disabled={isSaving || uploading} title={uploading ? "Waiting for images to upload" : undefined} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Blog"}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
};
