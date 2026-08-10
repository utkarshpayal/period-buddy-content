import React, { useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Film,
  Plus,
  Trash2,
  Eye,
  Heart,
  X,
  CheckCircle2,
  Wand2
} from "lucide-react";
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
import { GynacHead } from "./GynacHead";

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

export const GynacReels: React.FC = () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reel.");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this reel?")) return;
    try {
      await deleteReel(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete reel.");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyReel);
    setThumbStatus(null);
  };

  return (
    <div className="workspace-page">
      <GynacHead
        title="Reels & Content"
        subtitle={
          reels.length > 0
            ? `${reels.filter((r) => r.isActive).length} live · ${reels.length} total · ${reels.reduce(
                (s, r) => s + (r.viewCount ?? 0),
                0
              )} views. Publish short educational videos for the community.`
            : "Publish short educational videos for the Period Buddy community."
        }
        actions={
          <button className="gy-btn gy-btn-primary" type="button" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> New reel
          </button>
        }
      />

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <section className="gy-card gy-form-card">
          <div className="gy-card-head">
            <h3>Publish a reel</h3>
            <button className="gy-icon-btn" type="button" onClick={closeForm}>
              <X size={18} />
            </button>
          </div>
          <form className="gy-form-grid" onSubmit={submit}>
            <label className="gy-field gy-field-full">
              <span>Title *</span>
              <input
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="e.g. 3 quick tips to ease period cramps"
                required
              />
            </label>

            <div className="gy-field gy-field-full">
              <MediaUploadField
                kind="video"
                folder="reels"
                label="Reel video (uploads to storage)"
                value={form.directMp4Url}
                onChange={(url) => set({ directMp4Url: url })}
                onDurationChange={(seconds) => set({ duration: formatDuration(seconds) })}
                required
              />
            </div>

            <div className="gy-field gy-field-full">
              <MediaUploadField
                kind="image"
                folder="thumbnails"
                label="Thumbnail (optional — auto-generated from the video if left empty)"
                value={form.thumbnailUrl}
                onChange={(url) => set({ thumbnailUrl: url })}
              />
              {!form.thumbnailUrl && form.directMp4Url && (
                <button
                  className="gy-btn gy-btn-ghost gy-thumb-gen"
                  type="button"
                  onClick={async () => {
                    const url = await generateThumbnail();
                    if (url) set({ thumbnailUrl: url });
                    else setError("Auto-thumbnail failed — please upload one manually.");
                  }}
                >
                  <Wand2 size={14} /> Generate thumbnail from video
                </button>
              )}
              {thumbStatus && <p className="gy-muted gy-thumb-status">{thumbStatus}</p>}
            </div>

            <label className="gy-field">
              <span>Category</span>
              <input
                value={form.category}
                onChange={(e) => set({ category: e.target.value })}
                placeholder="Wellness"
              />
            </label>
            <label className="gy-field">
              <span>Duration (auto-filled)</span>
              <input
                value={form.duration}
                onChange={(e) => set({ duration: e.target.value })}
                placeholder="0:30"
              />
            </label>

            <div className="gy-form-actions gy-field-full">
              <button className="gy-btn gy-btn-ghost" type="button" onClick={closeForm}>
                Cancel
              </button>
              <button className="gy-btn gy-btn-primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading reels…</p>
        </div>
      ) : reels.length === 0 ? (
        <div className="gy-empty">
          <Film size={26} />
          <p>No reels yet. Publish your first educational video.</p>
        </div>
      ) : (
        <div className="gy-reel-grid">
          {reels.map((reel) => (
            <article className={`gy-card gy-reel-card ${reel.isActive ? "" : "inactive"}`} key={reel._id}>
              <div
                className="gy-reel-thumb"
                style={{ backgroundImage: `url(${reel.thumbnailUrl})` }}
              >
                <span className="gy-reel-duration">{reel.duration || "0:30"}</span>
                {!reel.isActive && <span className="gy-reel-badge">Hidden</span>}
              </div>
              <div className="gy-reel-body">
                <h4>{reel.title}</h4>
                <p className="gy-muted">{reel.category}</p>
                <div className="gy-reel-stats">
                  <span><Eye size={13} /> {reel.viewCount ?? 0}</span>
                  <span><Heart size={13} /> {reel.likeCount ?? 0}</span>
                </div>
                <div className="gy-reel-actions">
                  <button className="gy-btn gy-btn-ghost" type="button" onClick={() => toggleActive(reel)}>
                    {reel.isActive ? "Hide" : "Show"}
                  </button>
                  <button className="gy-btn gy-btn-danger" type="button" onClick={() => remove(reel._id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
