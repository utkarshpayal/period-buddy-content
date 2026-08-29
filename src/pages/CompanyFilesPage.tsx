import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Files,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Upload,
  Pencil,
  Trash2,
  X,
  Eye,
  Download,
  Link2,
  ExternalLink,
  Check,
  Globe,
  LayoutGrid,
  List,
  Image as ImageIcon,
  Film,
  FileText,
  FileSpreadsheet,
  Presentation,
  Archive,
  File as FileIcon
} from "lucide-react";
import {
  CompanyAsset,
  CompanyAssetCategory,
  COMPANY_ASSET_CATEGORIES,
  CATEGORY_LABELS,
  listCompanyAssets,
  uploadCompanyAsset,
  addCompanyAssetLink,
  updateCompanyAsset,
  deleteCompanyAsset,
  getDownloadUrl,
  previewKind,
  formatFileSize,
  uploaderLabel
} from "../api/companyAssetsApi";
import { useAppContext } from "../context/AppContext";

const PAGE_SIZE = 24;
const VIEW_MODE_KEY = "period-buddy-company-files-view";

type VisibilityFilter = "all" | "public" | "private";
type ViewMode = "grid" | "list";
type AddMode = "file" | "link";

type AddFormState = {
  file: File | null;
  linkUrl: string;
  title: string;
  description: string;
  category: CompanyAssetCategory;
  isPublic: boolean;
};

const EMPTY_ADD_FORM: AddFormState = {
  file: null,
  linkUrl: "",
  title: "",
  description: "",
  category: "other",
  isPublic: false
};

type EditFormState = {
  title: string;
  description: string;
  category: CompanyAssetCategory;
  isPublic: boolean;
  linkUrl: string;
};

function toEditForm(a: CompanyAsset): EditFormState {
  return {
    title: a.title,
    description: a.description ?? "",
    category: a.category,
    isPublic: a.isPublic,
    linkUrl: a.linkUrl ?? ""
  };
}

function fileIcon(mimeType?: string) {
  if (!mimeType) return FileIcon;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return Film;
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("word")) return FileText;
  if (mimeType.includes("sheet") || mimeType === "application/vnd.ms-excel") return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType === "application/vnd.ms-powerpoint") return Presentation;
  if (mimeType === "application/zip") return Archive;
  return FileIcon;
}

/** Icon for the asset regardless of type — a distinct glyph for links vs. the mimetype-based one for files. */
function assetIcon(a: CompanyAsset) {
  return a.assetType === "link" ? Link2 : fileIcon(a.mimeType);
}

/** The URL this asset actually points at — S3 for files, wherever it lives for links. */
function assetUrl(a: CompanyAsset): string {
  return a.assetType === "link" ? a.linkUrl ?? "" : a.fileUrl ?? "";
}

/** Hostname of a link asset's URL, for a compact "drive.google.com" style meta line. */
function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function readStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export const CompanyFilesPage: React.FC = () => {
  const { authSession } = useAppContext();

  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<CompanyAssetCategory | "all">("all");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("file");
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(toEditForm({} as CompanyAsset));
  const [savingEdit, setSavingEdit] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<CompanyAsset | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<CompanyAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Per-viewer convenience only — safe to skip if storage is unavailable.
    }
  }, [viewMode]);

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCompanyAssets({
        search: debouncedSearch || undefined,
        category: category === "all" ? undefined : category,
        isPublic: visibility === "all" ? undefined : visibility === "public",
        page: targetPage,
        limit: PAGE_SIZE
      });
      setAssets(res.assets);
      setPage(res.pagination.page);
      setPages(res.pagination.pages || 1);
      setTotal(res.pagination.total || res.assets.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, visibility]);

  const openAdd = (mode: AddMode) => {
    setAddMode(mode);
    setAddForm(EMPTY_ADD_FORM);
    setShowAdd(true);
    setNotice(null);
    setError(null);
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setAddForm((prev) => ({
      ...prev,
      file: picked,
      // Only default the title from the filename the first time — don't
      // clobber something the admin already typed.
      title: prev.title || picked.name.replace(/\.[^.]+$/, "")
    }));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim()) return setError("A title is required.");

    setSubmittingAdd(true);
    setError(null);
    try {
      if (addMode === "file") {
        if (!addForm.file) return setError("Choose a file to upload.");
        const res = await uploadCompanyAsset({
          file: addForm.file,
          title: addForm.title.trim(),
          description: addForm.description.trim(),
          category: addForm.category,
          isPublic: addForm.isPublic
        });
        setAssets((prev) => [res.asset, ...prev]);
        setTotal((t) => t + 1);
        setNotice(`Uploaded "${res.asset.title}".`);
      } else {
        if (!addForm.linkUrl.trim()) return setError("Paste a URL to link to.");
        const res = await addCompanyAssetLink({
          linkUrl: addForm.linkUrl.trim(),
          title: addForm.title.trim(),
          description: addForm.description.trim(),
          category: addForm.category,
          isPublic: addForm.isPublic
        });
        setAssets((prev) => [res.asset, ...prev]);
        setTotal((t) => t + 1);
        setNotice(`Added "${res.asset.title}".`);
      }
      setShowAdd(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this entry.");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const openEdit = (a: CompanyAsset) => {
    setEditingAsset(a);
    setEditForm(toEditForm(a));
    setNotice(null);
    setError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset) return;
    if (!editForm.title.trim()) return setError("Title cannot be empty.");
    if (editingAsset.assetType === "link" && !editForm.linkUrl.trim()) {
      return setError("URL cannot be empty.");
    }

    setSavingEdit(true);
    setError(null);
    try {
      const res = await updateCompanyAsset(editingAsset._id, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        isPublic: editForm.isPublic,
        ...(editingAsset.assetType === "link" ? { linkUrl: editForm.linkUrl.trim() } : {})
      });
      setAssets((prev) => prev.map((a) => (a._id === res.asset._id ? res.asset : a)));
      setNotice(`Updated "${res.asset.title}".`);
      setEditingAsset(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleVisibility = async (a: CompanyAsset) => {
    setBusyId(a._id);
    setError(null);
    try {
      const res = await updateCompanyAsset(a._id, { isPublic: !a.isPublic });
      setAssets((prev) => prev.map((x) => (x._id === a._id ? res.asset : x)));
      setNotice(res.asset.isPublic ? `"${res.asset.title}" is now public.` : `"${res.asset.title}" is now private.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change visibility.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (a: CompanyAsset) => {
    setDownloadingId(a._id);
    setError(null);
    try {
      const { url } = await getDownloadUrl(a._id);
      // The signed URL itself carries Content-Disposition: attachment, so a
      // plain navigation triggers a save dialog without leaving this page.
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a download link.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyLink = async (a: CompanyAsset) => {
    try {
      await navigator.clipboard.writeText(assetUrl(a));
      setCopiedId(a._id);
      setNotice(`Copied the link for "${a.title}".`);
      setTimeout(() => setCopiedId((id) => (id === a._id ? null : id)), 2000);
    } catch {
      setError("Couldn't copy automatically — copy the link manually instead.");
    }
  };

  const handleOpen = (a: CompanyAsset) => {
    if (a.assetType === "link") {
      window.open(a.linkUrl, "_blank", "noopener,noreferrer");
    } else {
      setPreviewAsset(a);
    }
  };

  const confirmDelete = (a: CompanyAsset) => {
    setDeletingAsset(a);
    setNotice(null);
    setError(null);
  };

  const handleDelete = async () => {
    const a = deletingAsset;
    if (!a) return;
    setDeleting(true);
    setBusyId(a._id);
    setError(null);
    try {
      await deleteCompanyAsset(a._id);
      setAssets((prev) => prev.filter((x) => x._id !== a._id));
      setTotal((t) => Math.max(0, t - 1));
      setNotice(`Deleted "${a.title}".`);
      setDeletingAsset(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this entry.");
    } finally {
      setDeleting(false);
      setBusyId(null);
    }
  };

  const metaLine = (a: CompanyAsset) => {
    const parts = [CATEGORY_LABELS[a.category]];
    if (a.assetType === "link") {
      parts.push("Link", linkHost(a.linkUrl ?? ""));
    } else {
      parts.push(formatFileSize(a.fileSize));
    }
    const who = uploaderLabel(a);
    if (who) parts.push(who);
    return parts.join(" · ");
  };

  // Shared action cluster — identical buttons in both grid and list views.
  const renderActions = (a: CompanyAsset) => {
    const busy = busyId === a._id;
    if (busy) return <Loader2 size={18} className="spin" />;
    return (
      <div className="file-card-buttons">
        <button
          className="gy-icon-btn"
          onClick={() => handleOpen(a)}
          type="button"
          title={a.assetType === "link" ? "Open link" : "Preview"}
        >
          {a.assetType === "link" ? <ExternalLink size={15} /> : <Eye size={15} />}
        </button>
        {a.isPublic && (
          <button className="gy-icon-btn" onClick={() => handleCopyLink(a)} type="button" title="Copy public link">
            {copiedId === a._id ? <Check size={15} /> : <Link2 size={15} />}
          </button>
        )}
        {a.assetType === "file" && (
          <button
            className="gy-icon-btn"
            onClick={() => handleDownload(a)}
            type="button"
            title="Download"
            disabled={downloadingId === a._id}
          >
            {downloadingId === a._id ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
          </button>
        )}
        <button className="gy-icon-btn" onClick={() => openEdit(a)} type="button" title="Edit">
          <Pencil size={15} />
        </button>
        <button className="gy-icon-btn gy-icon-btn-danger" onClick={() => confirmDelete(a)} type="button" title="Delete">
          <Trash2 size={15} />
        </button>
      </div>
    );
  };

  const categoryOptions = useMemo(
    () => COMPANY_ASSET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
    []
  );

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Company Library</p>
          <h2>Company Files</h2>
          <p className="subtitle-text">
            Pitch decks, flow diagrams, brand assets, and links — everything in one place.
          </p>
        </div>
        <div className="header-actions">
          <span className="gy-pill gy-pill-muted">
            <Files size={14} /> {total} total
          </span>
          <button className="gy-btn gy-btn-ghost" onClick={() => openAdd("link")} type="button">
            <Link2 size={16} /> Add Link
          </button>
          <button className="gy-btn gy-btn-primary" onClick={() => openAdd("file")} type="button">
            <Upload size={16} /> Upload File
          </button>
        </div>
      </header>

      {!authSession && (
        <div className="gy-alert gy-alert-warn">
          <AlertCircle size={16} />
          <span>Sign in as an admin to manage company files.</span>
        </div>
      )}
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="gy-alert gy-alert-ok">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* Add modal — upload a file or link to something hosted elsewhere */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => !submittingAdd && setShowAdd(false)}>
          <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{addMode === "file" ? "Upload a file" : "Add a link"}</h3>
              <button className="gy-icon-btn" onClick={() => setShowAdd(false)} type="button" disabled={submittingAdd}>
                <X size={18} />
              </button>
            </div>

            <div className="file-add-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "file"}
                className={`file-add-tab ${addMode === "file" ? "active" : ""}`}
                onClick={() => setAddMode("file")}
              >
                <Upload size={14} /> Upload file
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "link"}
                className={`file-add-tab ${addMode === "link" ? "active" : ""}`}
                onClick={() => setAddMode("link")}
              >
                <Link2 size={14} /> Add link
              </button>
            </div>

            <form className="gy-form-grid" onSubmit={handleAddSubmit}>
              {addMode === "file" ? (
                <div className="gy-field gy-field-full">
                  <span>File *</span>
                  <div className="media-upload-dropzone">
                    {addForm.file ? (
                      <p className="media-upload-empty">
                        {addForm.file.name} · {formatFileSize(addForm.file.size)}
                      </p>
                    ) : (
                      <p className="media-upload-empty">No file chosen yet.</p>
                    )}
                    <label className="media-upload-choose-btn">
                      <Upload size={15} />
                      {addForm.file ? "Choose a different file" : "Choose file"}
                      <input hidden onChange={handleFilePicked} ref={fileInputRef} type="file" />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="gy-field gy-field-full">
                  <span>URL *</span>
                  <input
                    type="url"
                    value={addForm.linkUrl}
                    onChange={(e) => setAddForm((p) => ({ ...p, linkUrl: e.target.value }))}
                    placeholder="https://drive.google.com/…"
                    required
                  />
                </label>
              )}

              <label className="gy-field gy-field-full">
                <span>Title *</span>
                <input
                  value={addForm.title}
                  onChange={(e) => setAddForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Series A Pitch Deck"
                  required
                />
              </label>

              <label className="gy-field">
                <span>Category</span>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value as CompanyAssetCategory }))}
                >
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="gy-switch">
                <input
                  type="checkbox"
                  checked={addForm.isPublic}
                  onChange={(e) => setAddForm((p) => ({ ...p, isPublic: e.target.checked }))}
                />
                <span className="gy-switch-track" aria-hidden />
                <span>Visible publicly</span>
              </label>

              <label className="gy-field gy-field-full">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={addForm.description}
                  onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What this is and when to use it."
                />
              </label>

              <div className="gy-form-actions gy-field-full">
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowAdd(false)} disabled={submittingAdd}>
                  Cancel
                </button>
                <button className="gy-btn gy-btn-primary" type="submit" disabled={submittingAdd}>
                  {submittingAdd ? (
                    <Loader2 className="spin-icon" size={16} />
                  ) : addMode === "file" ? (
                    <Upload size={16} />
                  ) : (
                    <Link2 size={16} />
                  )}
                  {submittingAdd ? "Saving…" : addMode === "file" ? "Upload" : "Add link"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit modal */}
      {editingAsset && (
        <div className="modal-overlay" onClick={() => !savingEdit && setEditingAsset(null)}>
          <section className="gy-card gy-form-card gy-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{editingAsset.assetType === "link" ? "Edit link" : "Edit file"}</h3>
              <button className="gy-icon-btn" onClick={() => setEditingAsset(null)} type="button" disabled={savingEdit}>
                <X size={18} />
              </button>
            </div>
            <form className="gy-form-grid" onSubmit={handleEditSubmit}>
              <label className="gy-field gy-field-full">
                <span>Title *</span>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </label>

              {editingAsset.assetType === "link" && (
                <label className="gy-field gy-field-full">
                  <span>URL *</span>
                  <input
                    type="url"
                    value={editForm.linkUrl}
                    onChange={(e) => setEditForm((p) => ({ ...p, linkUrl: e.target.value }))}
                    required
                  />
                </label>
              )}

              <label className="gy-field">
                <span>Category</span>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value as CompanyAssetCategory }))}
                >
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="gy-switch">
                <input
                  type="checkbox"
                  checked={editForm.isPublic}
                  onChange={(e) => setEditForm((p) => ({ ...p, isPublic: e.target.checked }))}
                />
                <span className="gy-switch-track" aria-hidden />
                <span>Visible publicly</span>
              </label>

              <label className="gy-field gy-field-full">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>

              <div className="gy-form-actions gy-field-full">
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setEditingAsset(null)} disabled={savingEdit}>
                  Cancel
                </button>
                <button className="gy-btn gy-btn-primary" type="submit" disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                  Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Preview modal — image/video/PDF render inline, right here; nothing
          opens a raw S3 link in a new tab. (Links open externally instead —
          see handleOpen — since we don't control or embed other sites.) */}
      {previewAsset && (
        <div className="modal-overlay" onClick={() => setPreviewAsset(null)}>
          <section className="gy-card file-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3 title={previewAsset.title}>{previewAsset.title}</h3>
              <div className="file-preview-head-actions">
                {previewAsset.isPublic && (
                  <button className="gy-btn gy-btn-ghost" onClick={() => handleCopyLink(previewAsset)} type="button">
                    {copiedId === previewAsset._id ? <Check size={15} /> : <Link2 size={15} />}
                    {copiedId === previewAsset._id ? "Copied" : "Copy link"}
                  </button>
                )}
                <button
                  className="gy-btn gy-btn-ghost"
                  onClick={() => handleDownload(previewAsset)}
                  type="button"
                  disabled={downloadingId === previewAsset._id}
                >
                  {downloadingId === previewAsset._id ? (
                    <Loader2 className="spin-icon" size={15} />
                  ) : (
                    <Download size={15} />
                  )}
                  Download
                </button>
                <button className="gy-icon-btn" onClick={() => setPreviewAsset(null)} type="button">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="file-preview-body">
              {previewKind(previewAsset.mimeType) === "image" && (
                <img src={previewAsset.fileUrl} alt={previewAsset.title} />
              )}
              {previewKind(previewAsset.mimeType) === "video" && (
                <video src={previewAsset.fileUrl} controls autoPlay />
              )}
              {previewKind(previewAsset.mimeType) === "pdf" && (
                <iframe src={previewAsset.fileUrl} title={previewAsset.title} />
              )}
              {previewKind(previewAsset.mimeType) === null && (
                <div className="file-preview-unsupported">
                  {React.createElement(fileIcon(previewAsset.mimeType), { size: 40 })}
                  <p>No inline preview for this file type. Use Download to view it.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingAsset && (
        <div className="modal-overlay" onClick={() => !deleting && setDeletingAsset(null)}>
          <section className="gy-card gy-form-card gy-modal-panel file-delete-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gy-card-head">
              <h3>{deletingAsset.assetType === "link" ? "Delete link" : "Delete file"}</h3>
              <button className="gy-icon-btn" onClick={() => setDeletingAsset(null)} type="button" disabled={deleting}>
                <X size={18} />
              </button>
            </div>

            <div className="file-delete-body">
              <AlertTriangle size={22} className="file-delete-icon" />
              <p>
                Delete <strong>"{deletingAsset.title}"</strong>?{" "}
                {deletingAsset.assetType === "link"
                  ? "This only removes it from the library — the destination itself is unaffected."
                  : "It will be permanently removed from S3."}{" "}
                {deletingAsset.isPublic && "Any public link to it will stop working."}
              </p>
            </div>

            <div className="gy-form-actions">
              <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setDeletingAsset(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="gy-btn gy-btn-danger" type="button" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="spin-icon" size={16} /> : <Trash2 size={16} />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Filter bar — type/visibility dropdowns on the left, search + view
          toggle grouped on the right. */}
      <div className="app-filter-bar">
        <select
          className="app-filter-select"
          value={category}
          onChange={(e) => setCategory(e.target.value as CompanyAssetCategory | "all")}
        >
          <option value="all">All types</option>
          {categoryOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          className="app-filter-select"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
        >
          <option value="all">Any visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>

        <div className="file-toolbar-right">
          <label className="scheme-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, description, or filename"
            />
          </label>

          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
              title="Card view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading files…</span>
        </div>
      ) : assets.length === 0 ? (
        <div className="gy-empty">
          <Files size={22} />
          <span>Nothing here yet. Upload a file or add a link to get started.</span>
        </div>
      ) : viewMode === "grid" ? (
        <div className="file-grid">
          {assets.map((a) => {
            const preview = a.assetType === "file" ? previewKind(a.mimeType) : null;
            const Icon = assetIcon(a);
            return (
              <div key={a._id} className="gy-card file-card">
                <div className="file-card-preview">
                  {preview === "image" ? (
                    <img src={a.fileUrl} alt="" loading="lazy" />
                  ) : preview === "video" ? (
                    <video src={a.fileUrl} muted />
                  ) : (
                    <Icon size={30} />
                  )}
                </div>

                <div className="file-card-body">
                  <div className="file-card-title-row">
                    <h3 title={a.title}>{a.title}</h3>
                    <span className={`gy-pill ${a.isPublic ? "gy-pill-ok" : "gy-pill-muted"}`}>
                      {a.isPublic ? <Globe size={12} /> : null}
                      {a.isPublic ? "Public" : "Private"}
                    </span>
                  </div>
                  <p className="file-card-meta">{metaLine(a)}</p>
                  {a.description && <p className="file-card-desc">{a.description}</p>}
                </div>

                <div className="file-card-actions">
                  <label className="gy-switch file-card-switch" title="Toggle public visibility">
                    <input
                      type="checkbox"
                      checked={a.isPublic}
                      disabled={busyId === a._id}
                      onChange={() => toggleVisibility(a)}
                    />
                    <span className="gy-switch-track" aria-hidden />
                    <span>Public</span>
                  </label>
                  {renderActions(a)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Visibility</th>
                <th>Uploaded</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const Icon = assetIcon(a);
                return (
                  <tr key={a._id}>
                    <td>
                      <div className="file-list-title">
                        <Icon size={17} className="file-list-icon" />
                        <div>
                          <div className="admin-user-name">{a.title}</div>
                          <div className="admin-user-sub">
                            {a.assetType === "link"
                              ? linkHost(a.linkUrl ?? "")
                              : `${CATEGORY_LABELS[a.category]} · ${formatFileSize(a.fileSize)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="gy-pill gy-pill-muted">{CATEGORY_LABELS[a.category]}</span>
                    </td>
                    <td>
                      <label className="gy-switch file-card-switch" title="Toggle public visibility">
                        <input
                          type="checkbox"
                          checked={a.isPublic}
                          disabled={busyId === a._id}
                          onChange={() => toggleVisibility(a)}
                        />
                        <span className="gy-switch-track" aria-hidden />
                        <span>{a.isPublic ? "Public" : "Private"}</span>
                      </label>
                    </td>
                    <td>
                      <div className="admin-user-name" style={{ fontWeight: 500 }}>
                        {uploaderLabel(a) ?? "—"}
                      </div>
                      {a.createdAt && (
                        <div className="admin-user-sub">{new Date(a.createdAt).toLocaleDateString()}</div>
                      )}
                    </td>
                    <td>
                      <div className="admin-cell-actions">{renderActions(a)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pages > 1 && (
        <div className="scheme-pagination">
          <button className="gy-btn gy-btn-ghost" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>
            Previous
          </button>
          <span className="scheme-page-indicator">
            Page {page} of {pages}
          </span>
          <button className="gy-btn gy-btn-ghost" type="button" disabled={page >= pages} onClick={() => load(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
};
