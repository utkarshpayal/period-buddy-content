import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

/** Same limit as the API (backend imageUpload). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Why `file` can't be a profile photo, or null when it's fine. */
export function photoFileError(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image (JPG, PNG or WebP).";
  if (file.size > MAX_PHOTO_BYTES) return "That photo is over 5 MB. Choose a smaller one.";
  return null;
}

function initials(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return [first, last].filter(Boolean).join("").toUpperCase() || "Dr";
}

/** A doctor's profile photo, or their initials when there isn't one (or it fails to load). */
export const DoctorAvatar: React.FC<{ name: string; url?: string | null; className?: string }> = ({
  name,
  url,
  className = "",
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <span className={`doc-photo ${className}`} aria-hidden="true">
      {url && !broken ? (
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="doc-photo-initials">{initials(name)}</span>
      )}
    </span>
  );
};

/**
 * Photo with "Upload / Change" and "Remove" buttons. `onPick` gets a file
 * that already passed `photoFileError`; validation messages go to `onError`.
 */
export const PhotoPicker: React.FC<{
  name: string;
  url?: string | null;
  busy?: boolean;
  hint?: string;
  avatarClassName?: string;
  onPick: (file: File) => void;
  onRemove?: () => void;
  onError: (message: string) => void;
}> = ({ name, url, busy, hint, avatarClassName, onPick, onRemove, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = photoFileError(file);
    if (problem) onError(problem);
    else onPick(file);
  };

  return (
    <div className="doc-photo-picker">
      <DoctorAvatar name={name} url={url} className={avatarClassName} />
      <div className="doc-photo-picker-body">
        <div className="doc-photo-picker-actions">
          <button className="gy-btn gy-btn-ghost" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="spin-icon" size={14} /> : <Camera size={14} />}
            {url ? "Change photo" : "Upload photo"}
          </button>
          {url && onRemove && (
            <button className="gy-btn gy-btn-ghost" type="button" disabled={busy} onClick={onRemove}>
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        {hint && <small>{hint}</small>}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleChange} />
    </div>
  );
};
