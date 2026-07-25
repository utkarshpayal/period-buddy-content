import React, { useState, useMemo } from "react";
import { 
  FileText, Search, Plus, Save, Clock, Tags, PencilLine, Trash2, Loader2, BookOpen, AlertCircle
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";
import { ContentItem, ContentStatus, Audience, CycleStage } from "../types/content";

const emptyBlog = (): ContentItem => ({
  id: crypto.randomUUID(),
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
  readTimeMinutes: 5,
  seoTitle: "",
  seoDescription: "",
  keywords: []
});

export const BlogsPage: React.FC = () => {
  const { items, isLoading, isSaving, createItem, updateItem, deleteItem } = useAppContext();
  
  const [draft, setDraft] = useState<ContentItem>(() => emptyBlog());
  const [editingId, setEditingId] = useState<string | null>(null);
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          <button className="primary-action" onClick={handleReset} type="button">
            <Plus size={18} />
            New Blog
          </button>
        }
      />
      
      <ApiBanner />

      <div className="content-layout">
        {/* Left list panel */}
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
                        <span className={`status-chip ${blog.status}`}>{blog.status}</span>
                      </div>
                      <p>{blog.summary || blog.body}</p>
                      <div className="entry-meta">
                        <span>
                          <Clock size={14} />
                          {blog.readTimeMinutes} min read
                        </span>
                        <span>
                          <Tags size={14} />
                          {blog.tags.join(", ") || "No tags"}
                        </span>
                        <span>• By {blog.author}</span>
                      </div>
                    </div>
                  </div>
                  <div className="entry-actions">
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

        {/* Right editor panel */}
        <form className="editor-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Blog Post" : "Create Blog Post"}</h3>
            <button className="save-button" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
              {isSaving ? "Saving" : "Save Blog"}
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

            <label className="wide-field">
              Article Content (Markdown Supported) *
              <textarea
                onChange={(e) => updateDraft("body", e.target.value)}
                placeholder="Write the full body of the blog article here..."
                required
                rows={10}
                value={draft.body}
              />
            </label>

            <label>
              Author Name
              <input
                onChange={(e) => updateDraft("author", e.target.value)}
                placeholder="e.g. Dr. Sarah Chen"
                value={draft.author}
              />
            </label>

            <label className="wide-field">
              Cover Image URL
              <input
                onChange={(e) => updateDraft("imageUrl", e.target.value)}
                placeholder="https://..."
                type="url"
                value={draft.imageUrl || ""}
              />
            </label>

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
              <span className={`status-chip ${draft.status}`}>{draft.status}</span>
              <span>{draft.audience} • {draft.stage}</span>
            </div>
            {draft.imageUrl && (
              <img alt="" className="preview-cover-image" src={draft.imageUrl} />
            )}
            <h4>{draft.title || "Untitled Blog Post"}</h4>
            <p className="preview-summary">{draft.summary || "No summary written."}</p>
            <div className="preview-body">
              {draft.body || "Start typing in the editor to see live updates."}
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
};
