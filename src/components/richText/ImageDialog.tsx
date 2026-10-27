import React, { useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { isUploadConfigured, uploadMediaFile } from "../../api/uploadApi";

type ImageDialogProps = {
  initial?: { src: string; alt: string; title: string };
  onSave: (image: { src: string; alt: string; title: string }) => void;
  onClose: () => void;
};

/** Upload (or link) an image and give it alt text and an optional caption. */
export const ImageDialog: React.FC<ImageDialogProps> = ({ initial, onSave, onClose }) => {
  const [src, setSrc] = useState(initial?.src ?? "");
  const [alt, setAlt] = useState(initial?.alt ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG, WebP or GIF).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadMediaFile(file, "thumbnails", file.name);
      setSrc(uploaded.url);
      if (!alt) setAlt(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const validUrl = /^https:\/\//i.test(src.trim());
  const canSave = validUrl && Boolean(alt.trim()) && !uploading;

  return (
    <div className="modal-overlay rte-dialog-overlay" data-esc-close onClick={onClose}>
      <form
        aria-labelledby="rte-image-title"
        aria-modal="true"
        className="rte-dialog rte-dialog-narrow"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave({ src: src.trim(), alt: alt.trim(), title: title.trim() });
        }}
        role="dialog"
      >
        <button aria-label="Close" className="modal-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
        <h3 id="rte-image-title">{initial ? "Image details" : "Add an image"}</h3>

        {error && (
          <div className="form-error-alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="rte-dialog-form">
          {src ? (
            <img alt="" className="rte-image-preview" src={src} />
          ) : (
            <button
              className="rte-image-drop"
              disabled={uploading || !isUploadConfigured()}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void upload(file);
              }}
              type="button"
            >
              {uploading ? <Loader2 className="spin-icon" size={22} /> : <ImagePlus size={22} />}
              <span>{uploading ? "Uploading…" : isUploadConfigured() ? "Upload an image, or drop one here" : "Uploads need the content API"}</span>
              {!uploading && <small>PNG, JPG, WebP or GIF · up to 10 MB</small>}
            </button>
          )}
          <input
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
            ref={fileRef}
            type="file"
          />
          {src && (
            <button className="rte-link-button" onClick={() => fileRef.current?.click()} type="button">
              Replace image
            </button>
          )}

          <label>
            Image URL
            <input onChange={(e) => setSrc(e.target.value)} placeholder="https://…" value={src} />
          </label>
          <label>
            Alt text (read out by screen readers) *
            <input
              autoFocus={Boolean(initial)}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="A hot water bag resting on a blanket"
              value={alt}
            />
          </label>
          <label>
            Caption (optional)
            <input onChange={(e) => setTitle(e.target.value)} placeholder="Shown under the image" value={title} />
          </label>
        </div>

        <div className="rte-dialog-footer">
          <button className="modal-cancel" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="save-button"
            disabled={!canSave}
            title={!validUrl ? "Add an https image" : !alt.trim() ? "Add alt text" : undefined}
            type="submit"
          >
            {initial ? "Update image" : "Insert image"}
          </button>
        </div>
      </form>
    </div>
  );
};
