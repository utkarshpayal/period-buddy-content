import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  FileQuestion,
  FileText,
  Film,
  Gauge,
  KeyRound,
  Layers3,
  Loader2,
  LogIn,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tags,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  clearAuthSession,
  getStoredAuthSession,
  loginWithEmail,
  AuthSession
} from "./api/authApi";
import { createContent, deleteContent, loadContent, updateContent, ApiSource } from "./api/contentApi";
import { Audience, ContentItem, ContentStatus, ContentType, CycleStage } from "./types/content";

const contentTypes: Array<{
  id: ContentType;
  label: string;
  icon: typeof FileText;
}> = [
  { id: "blog", label: "Blogs", icon: FileText },
  { id: "qa", label: "Q&A", icon: FileQuestion },
  { id: "video", label: "Videos", icon: Film },
  { id: "guide", label: "Guides", icon: BookOpen },
  { id: "tip", label: "Tips", icon: Sparkles }
];

const statuses: ContentStatus[] = ["draft", "review", "published", "archived"];
const audiences: Audience[] = ["All users", "Teens", "Adults", "Parents", "Partners"];
const stages: CycleStage[] = [
  "General",
  "Period",
  "PMS",
  "Ovulation",
  "Tracking",
  "Wellness",
  "Emergency"
];

const emptyItem = (): ContentItem => ({
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
  tags: [],
  author: "Content Team",
  reviewedBy: "",
  sourceLinks: [],
  updatedAt: new Date().toISOString(),
  reviewRequired: true
});

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const normalizeSourceLinks = (value: string) =>
  value
    .split(/[\n,]/)
    .map((link) => link.trim())
    .filter(Boolean);

const titleForType = (type: ContentType) => contentTypes.find((entry) => entry.id === type)?.label ?? type;

const getApiErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const isPermissionError = (message: string) =>
  message.toLowerCase().includes("permission") || message.includes("403");

export default function App() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [draft, setDraft] = useState<ContentItem>(() => emptyItem());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ContentType | "all">("all");
  const [activeStatus, setActiveStatus] = useState<ContentStatus | "all">("all");
  const [apiMessage, setApiMessage] = useState("Connecting to content source...");
  const [apiSource, setApiSource] = useState<ApiSource>("local");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [authForm, setAuthForm] = useState({
    adminCode: "",
    confirmPassword: "",
    email: "",
    firstName: "",
    lastName: "",
    password: ""
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const userFullName = [authSession?.user?.firstName, authSession?.user?.lastName].filter(Boolean).join(" ");
  const signedInLabel = authSession?.user?.email || userFullName || authSession?.user?.name;
  const signedInRole = authSession?.user?.role;

  useEffect(() => {
    let ignore = false;

    async function fetchContent() {
      setIsLoading(true);

      try {
        const result = await loadContent();

        if (!ignore) {
          setItems(result.items);
          setApiMessage(result.message);
          setApiSource(result.source);
        }
      } catch (error) {
        if (!ignore) {
          setApiMessage(error instanceof Error ? error.message : "Unable to load content.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchContent();

    return () => {
      ignore = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const published = items.filter((item) => item.status === "published").length;
    const qaEntries = items.filter((item) => item.type === "qa").length;
    const medical = items.filter((item) => item.reviewRequired).length;

    return [
      { label: "Total entries", value: items.length, icon: Layers3 },
      { label: "Published", value: published, icon: CheckCircle2 },
      { label: "Q&A entries", value: qaEntries, icon: ClipboardList },
      { label: "Review needed", value: medical, icon: Gauge }
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesType = activeType === "all" || item.type === activeType;
      const matchesStatus = activeStatus === "all" || item.status === activeStatus;
      const searchable = [
        item.title,
        item.summary,
        item.body,
        item.question,
        item.answer,
        item.author,
        item.reviewedBy,
        ...item.sourceLinks,
        item.stage,
        item.audience,
        ...item.tags
      ]
        .join(" ")
        .toLowerCase();

      return matchesType && matchesStatus && (!search || searchable.includes(search));
    });
  }, [activeStatus, activeType, items, query]);

  const previewItem = draft;

  async function refreshItems() {
    setIsLoading(true);

    try {
      const result = await loadContent();
      setItems(result.items);
      setApiMessage(result.message);
      setApiSource(result.source);
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to refresh content.");
      setApiMessage(message);
      setApiSource(isPermissionError(message) ? "blocked" : "local");
    } finally {
      setIsLoading(false);
    }
  }

  function updateDraft<K extends keyof ContentItem>(key: K, value: ContentItem[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMedicalReview(isReviewed: boolean) {
    setDraft((current) => ({
      ...current,
      medicallyReviewed: isReviewed,
      reviewRequired: !isReviewed
    }));
  }

  function resetForm(type: ContentType = draft.type) {
    setDraft({ ...emptyItem(), type });
    setEditingId(null);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      adminCode: undefined,
      confirmPassword: undefined,
      email: authForm.email.trim(),
      firstName: undefined,
      lastName: undefined,
      password: authForm.password,
      role: undefined
    };

    if (!payload.email || !payload.password) {
      setApiMessage("Enter email and password to continue.");
      return;
    }

    setIsAuthLoading(true);

    try {
      const result = await loginWithEmail(payload);

      setAuthSession(result.session);
      setAuthForm({ adminCode: "", confirmPassword: "", email: "", firstName: "", lastName: "", password: "" });
      setApiMessage(`${result.message} Refreshing API content...`);
      await refreshItems();
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to authenticate.");
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    clearAuthSession();
    setAuthSession(null);
    setApiMessage("Logged out. API requests will not include your saved session.");
    await refreshItems();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = draft.question.trim() || (draft.type === "qa" ? draft.title.trim() : "");
    const answer = draft.answer.trim() || (draft.type === "qa" ? draft.body.trim() : "");
    const nextItem: ContentItem = {
      ...draft,
      title: draft.type === "qa" ? draft.title.trim() || question : draft.title.trim(),
      summary: draft.summary.trim(),
      body: draft.body.trim(),
      question,
      answer,
      isSensitive: draft.isSensitive,
      medicallyReviewed: draft.medicallyReviewed,
      videoUrl: draft.videoUrl.trim(),
      author: draft.author.trim() || "Content Team",
      reviewedBy: draft.reviewedBy.trim(),
      sourceLinks: draft.sourceLinks.map((link) => link.trim()).filter(Boolean),
      updatedAt: new Date().toISOString()
    };

    if (!nextItem.title) {
      setApiMessage("Add a title before saving this entry.");
      return;
    }

    if (nextItem.type === "qa" && (!nextItem.question || !nextItem.answer)) {
      setApiMessage("Q&A entries need both a user question and an approved answer before saving.");
      return;
    }

    if (nextItem.type === "qa" && nextItem.medicallyReviewed && !nextItem.reviewedBy) {
      setApiMessage("Add the reviewer name before marking a Q&A entry medically reviewed.");
      return;
    }

    if (nextItem.type === "blog" && !nextItem.body) {
      setApiMessage("Blog entries need body content before saving.");
      return;
    }

    if (nextItem.type === "video" && !nextItem.videoUrl) {
      setApiMessage("Video entries need a video URL before saving.");
      return;
    }

    if ((nextItem.type === "guide" || nextItem.type === "tip") && !nextItem.summary) {
      setApiMessage("Guides and tips need a short summary before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const result = editingId
        ? await updateContent(editingId, nextItem)
        : await createContent(nextItem);
      const savedItem = result.item ?? nextItem;

      setItems((current) => {
        if (editingId) {
          return current.map((item) => (item.id === editingId ? savedItem : item));
        }

        return [savedItem, ...current];
      });
      setApiMessage(result.message);
      setApiSource(result.source);
      resetForm(savedItem.type);
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to save content.");
      setApiMessage(message);
      setApiSource(isPermissionError(message) ? "blocked" : apiSource);
    } finally {
      setIsSaving(false);
    }
  }

  function editItem(item: ContentItem) {
    setDraft(item);
    setEditingId(item.id);
    setActiveType(item.type);
  }

  async function deleteItem(item: ContentItem) {
    setDeletingId(item.id);

    try {
      const result = await deleteContent(item.id, item.type);
      setItems((current) => current.filter((contentItem) => contentItem.id !== item.id));
      setApiMessage(result.message);
      setApiSource(result.source);

      if (editingId === item.id) {
        resetForm();
      }
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to delete content.");
      setApiMessage(message);
      setApiSource(isPermissionError(message) ? "blocked" : apiSource);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">PB</div>
          <div>
            <p className="eyebrow">Period Buddy</p>
            <h1>Content Studio</h1>
          </div>
        </div>

        <nav className="type-nav" aria-label="Content type filters">
          <button
            className={activeType === "all" ? "type-button active" : "type-button"}
            onClick={() => setActiveType("all")}
            type="button"
          >
            <Archive size={18} />
            All content
          </button>
          {contentTypes.map((type) => {
            const Icon = type.icon;

            return (
              <button
                className={activeType === type.id ? "type-button active" : "type-button"}
                key={type.id}
                onClick={() => setActiveType(type.id)}
                type="button"
              >
                <Icon size={18} />
                {type.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <p>Ready for app CMS, companion Q&A, learning cards, and video scripts.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Content operations</p>
            <h2>Plan, review, and publish Period Buddy content</h2>
          </div>
          <button className="primary-action" onClick={() => resetForm()} type="button">
            <Plus size={18} />
            New entry
          </button>
        </header>

        <section className={`api-banner ${apiSource}`} aria-live="polite">
          <div>
            <Database size={18} />
            <strong>
              {apiSource === "api" ? "API connected" : apiSource === "blocked" ? "Permission needed" : "Local mode"}
            </strong>
            <span>{apiMessage}</span>
          </div>
          <button disabled={isLoading} onClick={refreshItems} type="button">
            {isLoading ? <Loader2 className="spin-icon" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </section>

        <section className="login-panel" aria-label="API login">
          <div className="login-panel-heading">
            <KeyRound size={18} />
            <div>
              <strong>{authSession ? "Signed in" : "Email login"}</strong>
              <span>
                {signedInLabel || "Login with your admin account."}
                {signedInRole ? ` • role: ${signedInRole}` : ""}
              </span>
            </div>
          </div>
          {authSession ? (
            <button className="secondary-action" onClick={handleLogout} type="button">
              <LogOut size={16} />
              Logout
            </button>
          ) : (
            <form className="login-form" onSubmit={handleAuthSubmit}>
              <input
                aria-label="Email"
                autoComplete="email"
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                required
                type="email"
                value={authForm.email}
              />
              <input
                aria-label="Password"
                autoComplete="current-password"
                minLength={6}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Password"
                required
                type="password"
                value={authForm.password}
              />
              <button className="secondary-action" disabled={isAuthLoading} type="submit">
                {isAuthLoading ? <Loader2 className="spin-icon" size={16} /> : <LogIn size={16} />}
                Login
              </button>
            </form>
          )}
        </section>

        <section className="metric-grid" aria-label="Content summary">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <article className="metric-card" key={metric.label}>
                <Icon size={20} />
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            );
          })}
        </section>

        <section className="content-layout">
          <div className="library-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Library</p>
                <h3>{activeType === "all" ? "All entries" : titleForType(activeType)}</h3>
              </div>
              <span>{filteredItems.length} shown</span>
            </div>

            <div className="filter-row">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search content"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, question, tags"
                  value={query}
                />
              </label>
              <select
                aria-label="Filter by status"
                onChange={(event) => setActiveStatus(event.target.value as ContentStatus | "all")}
                value={activeStatus}
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="entry-list">
              {isLoading && (
                <div className="empty-state">
                  <Loader2 className="spin-icon" size={28} />
                  <h4>Loading content</h4>
                  <p>Fetching the latest entries from the configured content source.</p>
                </div>
              )}

              {!isLoading && filteredItems.map((item) => {
                const type = contentTypes.find((entry) => entry.id === item.type);
                const Icon = type?.icon ?? FileText;

                return (
                  <article
                    className={editingId === item.id ? "entry-card selected" : "entry-card"}
                    key={item.id}
                  >
                    <div className="entry-card-main">
                      <div className="entry-icon">
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="entry-title-row">
                          <h4>{item.title}</h4>
                          <span className={`status-chip ${item.status}`}>{item.status}</span>
                        </div>
                        <p>{item.summary || item.question || item.body}</p>
                        <div className="entry-meta">
                          <span>
                            <Clock3 size={14} />
                            {formatDate(item.updatedAt)}
                          </span>
                          <span>
                            <Tags size={14} />
                            {item.tags.slice(0, 3).join(", ") || "No tags"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="entry-actions">
                      <button aria-label={`Edit ${item.title}`} onClick={() => editItem(item)} type="button">
                        <PencilLine size={17} />
                      </button>
                      <button
                        aria-label={`Delete ${item.title}`}
                        disabled={deletingId === item.id}
                        onClick={() => deleteItem(item)}
                        type="button"
                      >
                        {deletingId === item.id ? <Loader2 className="spin-icon" size={17} /> : <Trash2 size={17} />}
                      </button>
                    </div>
                  </article>
                );
              })}

              {!isLoading && filteredItems.length === 0 && (
                <div className="empty-state">
                  <Archive size={28} />
                  <h4>No matching content</h4>
                  <p>Adjust the filters or create a fresh entry for this content area.</p>
                </div>
              )}
            </div>
          </div>

          <form className="editor-panel" onSubmit={handleSubmit}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Editor</p>
                <h3>{editingId ? "Edit entry" : "Create entry"}</h3>
              </div>
              <button className="save-button" disabled={isSaving} type="submit">
                {isSaving ? <Loader2 className="spin-icon" size={17} /> : <Save size={17} />}
                {isSaving ? "Saving" : "Save"}
              </button>
            </div>

            <div className="form-grid">
              <label>
                Type
                <select onChange={(event) => updateDraft("type", event.target.value as ContentType)} value={draft.type}>
                  {contentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  onChange={(event) => updateDraft("status", event.target.value as ContentStatus)}
                  value={draft.status}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wide-field">
                Title
                <input
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder={draft.type === "qa" ? "Optional internal title" : "Content title"}
                  required={draft.type !== "qa"}
                  value={draft.title}
                />
              </label>

              <label>
                Audience
                <select
                  onChange={(event) => updateDraft("audience", event.target.value as Audience)}
                  value={draft.audience}
                >
                  {audiences.map((audience) => (
                    <option key={audience} value={audience}>
                      {audience}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cycle area
                <select
                  onChange={(event) => updateDraft("stage", event.target.value as CycleStage)}
                  value={draft.stage}
                >
                  {stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wide-field">
                Summary
                <textarea
                  onChange={(event) => updateDraft("summary", event.target.value)}
                  placeholder="Short in-app summary"
                  rows={3}
                  value={draft.summary}
                />
              </label>

              {draft.type === "qa" && (
                <>
                  <label className="wide-field">
                    User question
                    <textarea
                      onChange={(event) => updateDraft("question", event.target.value)}
                      placeholder="Is brown period blood normal?"
                      rows={3}
                      value={draft.question}
                    />
                  </label>

	                  <label className="wide-field">
	                    Approved answer
	                    <textarea
                      onChange={(event) => updateDraft("answer", event.target.value)}
                      placeholder="Clear, medically safe answer for Nura Companion"
                      rows={5}
	                      value={draft.answer}
	                    />
	                  </label>

                  <label>
                    Reviewed by
                    <input
                      onChange={(event) => updateDraft("reviewedBy", event.target.value)}
                      placeholder="Clinician or reviewer name"
                      value={draft.reviewedBy}
                    />
                  </label>

                  <label className="review-toggle">
                    <input
                      checked={draft.medicallyReviewed}
                      onChange={(event) => updateMedicalReview(event.target.checked)}
                      type="checkbox"
                    />
                    Medically reviewed
                  </label>

                  <label className="review-toggle wide-field">
                    <input
                      checked={draft.isSensitive}
                      onChange={(event) => updateDraft("isSensitive", event.target.checked)}
                      type="checkbox"
                    />
                    Sensitive Q&A
                  </label>

                  <label className="wide-field">
                    Source links
                    <textarea
                      onChange={(event) => updateDraft("sourceLinks", normalizeSourceLinks(event.target.value))}
                      placeholder="https://example.org/source"
                      rows={3}
                      value={draft.sourceLinks.join("\n")}
                    />
                  </label>
	                </>
	              )}

              {draft.type === "video" && (
                <label className="wide-field">
                  Video URL
                  <input
                    onChange={(event) => updateDraft("videoUrl", event.target.value)}
                    placeholder="https://"
                    type="url"
                    value={draft.videoUrl}
                  />
                </label>
              )}

              <label className="wide-field">
                Body
                <textarea
                  onChange={(event) => updateDraft("body", event.target.value)}
                  placeholder="Article, guide, script, or supporting content"
                  rows={7}
                  value={draft.body}
                />
              </label>

              <label>
                Author
                <input
                  onChange={(event) => updateDraft("author", event.target.value)}
                  placeholder="Content Team"
                  value={draft.author}
                />
              </label>

              <label>
                Tags
                <input
                  onChange={(event) => updateDraft("tags", normalizeTags(event.target.value))}
                  placeholder="period, cramps, PMS"
                  value={draft.tags.join(", ")}
                />
              </label>
            </div>

	            <label className="review-toggle">
	              <input
	                checked={draft.reviewRequired}
                onChange={(event) => {
                  if (draft.type === "qa") {
                    updateMedicalReview(!event.target.checked);
                    return;
                  }

                  updateDraft("reviewRequired", event.target.checked);
                }}
	                type="checkbox"
	              />
              {draft.type === "qa" ? "Needs medical review" : "Medical review required"}
	            </label>

            <aside className="preview-pane">
              <div className="preview-heading">
                <span className={`status-chip ${previewItem.status}`}>{previewItem.status}</span>
                <span>{previewItem.audience}</span>
              </div>
              <h4>{previewItem.title || "Untitled entry"}</h4>
              <p>{previewItem.summary || previewItem.question || "No summary yet."}</p>
              <div className="preview-body">
                {previewItem.answer || previewItem.body || "The preview will show the answer, article, guide, or video script here."}
              </div>
            </aside>
          </form>
        </section>
      </section>
    </main>
  );
}
