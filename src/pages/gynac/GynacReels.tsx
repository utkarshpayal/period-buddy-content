import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Film, Plus, Trash2, Eye, EyeOff, Heart, X, CheckCircle2, Wand2, PlayCircle } from "lucide-react";
import {
  Reel,
  getMyReels,
  createReel,
  updateReel,
  deleteReel
} from "../../api/doctorApi";
import { MediaUploadField } from "../../components/MediaUploadField";
import { uploadMediaFile } from "../../api/uploadApi";
import { captureVideoThumbnail, formatDuration } from "../../lib/videoThumbnail";
import { EmptyState, ErrorState, PageHeader, StatCard, Tabs, timeAgo } from "../../components/ui";
import { useToast } from "../../components/Toast";

type ReelForm = {
  title: string;
  category: string;
  duration: string;
  directMp4Url: string;
  thumbnailUrl: string;
};

const emptyReel: ReelForm = {
  title: "",
  category: "",
  duration: "",
  directMp4Url: "",
  thumbnailUrl: ""
};

type ReelFilter = "all" | "live" | "hidden";

export const GynacReels: React.FC = () => {
  const toast = useToast();
  const [filter, setFilter] = useState<ReelFilter>("all");
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ReelForm>(emptyReel);
  const [saving, setSaving] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReels(await getMyReels());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reels.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (patch: Partial<ReelForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const generateThumbnail = async (): Promise<string | null> => {
    if (!form.directMp4Url) return null;
    setThumbStatus("Generating thumbnail from video…");
    try {
      const blob = await captureVideoThumbnail(form.directMp4Url);
      const uploaded = await uploadMediaFile(blob, "thumbnails", `reel-thumb-${Date.now()}.jpg`);
      setThumbStatus("Thumbnail generated from video.");
      return uploaded.url;
    } catch {
      setThumbStatus(null);
      return null;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!form.directMp4Url.trim()) {
      setError("Upload a video first.");
      return;
    }

    setSaving(true);
    try {
      // Auto-generate a thumbnail from the video frame when none was uploaded.
      let thumbnailUrl = form.thumbnailUrl.trim();
      if (!thumbnailUrl) {
        const generated = await generateThumbnail();
        if (!generated) {
          setSaving(false);
          setError(
            "Could not auto-generate a thumbnail from this video. Please upload a thumbnail image manually."
          );
          return;
        }
        thumbnailUrl = generated;
      }

      await createReel({
        title: form.title.trim(),
        directMp4Url: form.directMp4Url.trim(),
        thumbnailUrl,
        category: form.category.trim() || undefined,
        duration: form.duration.trim() || undefined
      });
      setForm(emptyReel);
      setThumbStatus(null);
      setShowForm(false);
      await load();
      toast.success("Reel published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish reel.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (reel: Reel) => {
    try {
      await updateReel(reel._id, { isActive: !reel.isActive });
      await load();
      toast.success(reel.isActive ? "Reel hidden from the app." : "Reel is live again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update reel.");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this reel? This can't be undone.")) return;
    try {
      await deleteReel(id);
      await load();
      toast.success("Reel deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete reel.");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyReel);
    setThumbStatus(null);
  };

  const totals = useMemo(
    () => ({
      live: reels.filter((r) => r.isActive).length,
      views: reels.reduce((sum, r) => sum + (r.viewCount ?? 0), 0),
      likes: reels.reduce((sum, r) => sum + (r.likeCount ?? 0), 0)
    }),
    [reels]
  );

  const shown = reels.filter((r) => (filter === "all" ? true : filter === "live" ? r.isActive : !r.isActive));

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Content"
        title="Reels"
        subtitle="Short educational videos that appear in the Nura community feed under your name."
        actions={
          <button className="gx-btn gx-btn-primary" type="button" onClick={() => setShowForm(true)}>
            <Plus size={16} /> New reel
          </button>
        }
      />

      {error && !showForm && <ErrorState message={error} />}

      <div className="gx-stat-grid is-3">
        <StatCard tone="berry" icon={<PlayCircle size={20} />} label="Live reels" value={totals.live} hint={`${reels.length} total`} />
        <StatCard tone="teal" icon={<Eye size={20} />} label="Total views" value={totals.views.toLocaleString()} />
        <StatCard tone="plum" icon={<Heart size={20} />} label="Total likes" value={totals.likes.toLocaleString()} />
      </div>

      {reels.length > 0 && (
        <Tabs
          label="Filter reels"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "All", count: reels.length },
            { value: "live", label: "Live", count: totals.live },
            { value: "hidden", label: "Hidden", count: reels.length - totals.live }
          ]}
        />
      )}

      {loading ? (
        <div className="gx-reel-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="gx-skeleton" style={{ height: 320, borderRadius: 18 }} />
          ))}
        </div>
      ) : reels.length === 0 ? (
        <div className="gx-card">
          <EmptyState
            icon={<Film size={24} />}
            title="Share your first reel"
            action={
              <button className="gx-btn gx-btn-primary" type="button" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Upload a video
              </button>
            }
          >
            A 30–60 second tip on cramps, PCOS or cycle health is a great way to build trust with patients.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="gx-card">
          <EmptyState icon={<Film size={22} />} title={`No ${filter} reels`} />
        </div>
      ) : (
        <div className="gx-reel-grid">
          {shown.map((reel) => (
            <article className={`gx-reel ${reel.isActive ? "" : "is-hidden"}`} key={reel._id}>
              <a className="gx-reel-thumb" href={reel.directMp4Url} target="_blank" rel="noreferrer" style={{ backgroundImage: `url(${reel.thumbnailUrl})` }}>
                <span className="gx-reel-play" aria-hidden><PlayCircle size={40} /></span>
                <span className="gx-reel-duration">{reel.duration || "0:30"}</span>
                <span className={`gx-reel-state ${reel.isActive ? "is-live" : ""}`}>{reel.isActive ? "Live" : "Hidden"}</span>
              </a>
              <div className="gx-reel-body">
                <h3 title={reel.title}>{reel.title}</h3>
                <p className="gx-muted">
                  {reel.category || "General"}
                  {reel.publishedAt ? ` · ${timeAgo(reel.publishedAt)}` : ""}
                </p>
                <div className="gx-reel-foot">
                  <span className="gx-reel-stats">
                    <span><Eye size={14} /> {reel.viewCount ?? 0}</span>
                    <span><Heart size={14} /> {reel.likeCount ?? 0}</span>
                  </span>
                  <span className="gx-reel-actions">
                    <button className="gx-icon-btn" type="button" onClick={() => toggleActive(reel)} title={reel.isActive ? "Hide from app" : "Make live"} aria-label={reel.isActive ? "Hide from app" : "Make live"}>
                      {reel.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button className="gx-icon-btn is-danger" type="button" onClick={() => remove(reel._id)} title="Delete" aria-label="Delete reel">
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <div className="gx-overlay is-centered" data-esc-close onClick={closeForm}>
          <form className="gx-dialog is-wide" onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish a reel">
            <div className="gx-drawer-head">
              <span><Film size={16} /> Publish a reel</span>
              <button className="gx-icon-btn" type="button" aria-label="Close" onClick={closeForm}>
                <X size={18} />
              </button>
            </div>

            {error && <ErrorState message={error} />}

            <div className="gx-form-grid">
              <label className="gx-field gx-field-full">
                <span>Title</span>
                <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. 3 quick tips to ease period cramps" required autoFocus />
              </label>

              <div className="gx-field gx-field-full">
                <MediaUploadField
                  kind="video"
                  folder="reels"
                  label="Video"
                  value={form.directMp4Url}
                  onChange={(url) => set({ directMp4Url: url })}
                  onDurationChange={(seconds) => set({ duration: formatDuration(seconds) })}
                  required
                />
              </div>

              <div className="gx-field gx-field-full">
                <MediaUploadField
                  kind="image"
                  folder="thumbnails"
                  label="Thumbnail (optional — we'll grab a frame from the video)"
                  value={form.thumbnailUrl}
                  onChange={(url) => set({ thumbnailUrl: url })}
                />
                {!form.thumbnailUrl && form.directMp4Url && (
                  <button
                    className="gx-btn gx-btn-ghost gx-btn-sm"
                    type="button"
                    onClick={async () => {
                      const url = await generateThumbnail();
                      if (url) set({ thumbnailUrl: url });
                      else setError("Auto-thumbnail failed — please upload one manually.");
                    }}
                  >
                    <Wand2 size={14} /> Generate from video
                  </button>
                )}
                {thumbStatus && <small className="gx-muted">{thumbStatus}</small>}
              </div>

              <label className="gx-field">
                <span>Category</span>
                <input value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="Wellness" />
              </label>
              <label className="gx-field">
                <span>Duration</span>
                <input value={form.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Filled in from the video" />
              </label>
            </div>

            <div className="gx-dialog-actions">
              <button className="gx-btn gx-btn-ghost" type="button" onClick={closeForm}>
                Cancel
              </button>
              <button className="gx-btn gx-btn-primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                {saving ? "Publishing…" : "Publish reel"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
