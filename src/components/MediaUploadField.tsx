import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Link2, Loader2, Scissors, Upload, X } from "lucide-react";
import { MediaFolder, uploadMediaFile } from "../api/uploadApi";
import { AUDIO_TRIM_MIME_TYPE, canTrimMedia, recordTrimmedMedia, VIDEO_TRIM_MIME_TYPE } from "../lib/mediaTrim";
import { reelVideoWarnings } from "../lib/videoUploadCheck";

type MediaKind = "video" | "audio" | "image";

type MediaUploadFieldProps = {
  kind: MediaKind;
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: MediaFolder;
  required?: boolean;
  /** Emits the effective clip length (seconds) once metadata loads and again
   * after a (possibly trimmed) upload. Used to auto-fill reel duration. */
  onDurationChange?: (seconds: number) => void;
};

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const MediaUploadField: React.FC<MediaUploadFieldProps> = ({
  kind,
  label,
  value,
  onChange,
  folder,
  required,
  onDurationChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getMediaEl = (): HTMLMediaElement | null => (kind === "video" ? videoRef.current : audioRef.current);

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const checkedFileRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const resetStagedFile = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFile(null);
    setObjectUrl(null);
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setWarnings([]);
    checkedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFile(selected);
    setObjectUrl(URL.createObjectURL(selected));
    setStatus("idle");
    setError(null);
    setWarnings([]);
    checkedFileRef.current = selected;
    if (kind === "video") {
      void reelVideoWarnings(selected).then((found) => {
        // Ignore the result if another file was picked (or the pick cancelled) meanwhile.
        if (checkedFileRef.current === selected) setWarnings(found);
      });
    }
  };

  const handleLoadedMetadata = () => {
    const el = getMediaEl();
    if (!el || !Number.isFinite(el.duration)) return;
    setDuration(el.duration);
    setTrimStart(0);
    setTrimEnd(el.duration);
    onDurationChange?.(el.duration);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);

    try {
      const isTrimmed = kind !== "image" && (trimStart > 0.05 || trimEnd < duration - 0.05);
      let payload: File | Blob = file;
      let filename = file.name;

      if (isTrimmed) {
        const el = getMediaEl();
        if (!el || !canTrimMedia(el)) {
          throw new Error("Trimming isn't supported in this browser. Reset the trim range to the full clip to upload as-is.");
        }
        const mimeType = kind === "video" ? VIDEO_TRIM_MIME_TYPE : AUDIO_TRIM_MIME_TYPE;
        payload = await recordTrimmedMedia(el, trimStart, trimEnd, mimeType);
        filename = `${kind === "video" ? "reel" : "audio"}-trim-${Date.now()}.webm`;
      }

      const result = await uploadMediaFile(payload, folder, filename);
      onChange(result.url);
      if (kind !== "image") {
        const effective = isTrimmed ? Math.max(0, trimEnd - trimStart) : duration;
        if (effective > 0) onDurationChange?.(effective);
      }
      resetStagedFile();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const accept = kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "image/*";
  const uploading = status === "uploading";

  return (
    <div className="media-upload-field">
      <div className="media-upload-label-row">
        <span>
          {label}
          {required ? " *" : ""}
        </span>
        <button
          className="media-upload-toggle"
          onClick={() => setShowManualUrl((prev) => !prev)}
          type="button"
        >
          <Link2 size={13} />
          {showManualUrl ? "Hide manual URL" : "Paste URL instead"}
        </button>
      </div>

      {showManualUrl && (
        <input
          className="media-upload-manual-input"
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          type="url"
          value={value}
        />
      )}

      {!objectUrl && (
        <div className="media-upload-dropzone">
          {value ? (
            kind === "video" ? (
              <video className="media-upload-preview" controls src={value} />
            ) : kind === "audio" ? (
              <audio className="media-upload-preview" controls src={value} />
            ) : (
              <img alt="" className="media-upload-preview" src={value} />
            )
          ) : (
            <p className="media-upload-empty">No {kind} uploaded yet.</p>
          )}
          <label className="media-upload-choose-btn">
            <Upload size={15} />
            {value ? `Replace ${kind}` : `Upload ${kind}`}
            <input accept={accept} hidden onChange={handleFileSelect} ref={fileInputRef} type="file" />
          </label>
        </div>
      )}

      {objectUrl && (
        <div className="media-upload-editor">
          {kind === "video" ? (
            <video
              className="media-upload-preview"
              controls
              onLoadedMetadata={handleLoadedMetadata}
              ref={videoRef}
              src={objectUrl}
            />
          ) : kind === "audio" ? (
            <audio
              className="media-upload-preview"
              controls
              onLoadedMetadata={handleLoadedMetadata}
              ref={audioRef}
              src={objectUrl}
            />
          ) : (
            <img alt="" className="media-upload-preview" src={objectUrl} />
          )}

          {kind !== "image" && duration > 0 && (
            <div className="media-trim-row">
              <Scissors size={14} />
              <label>
                Start
                <input
                  max={trimEnd}
                  min={0}
                  onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.1))}
                  step={0.1}
                  type="range"
                  value={trimStart}
                />
                <span>{formatSeconds(trimStart)}</span>
              </label>
              <label>
                End
                <input
                  max={duration}
                  min={trimStart}
                  onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.1))}
                  step={0.1}
                  type="range"
                  value={trimEnd}
                />
                <span>{formatSeconds(trimEnd)}</span>
              </label>
            </div>
          )}

          {warnings.map((warning) => (
            <div className="media-upload-status warning" key={warning}>
              <AlertTriangle size={14} />
              <span>{warning}</span>
            </div>
          ))}

          <div className="media-upload-actions">
            <button className="btn-add-opt" disabled={uploading} onClick={handleUpload} type="button">
              {uploading ? <Loader2 className="spin-icon" size={15} /> : <Upload size={15} />}
              {uploading ? "Uploading..." : "Upload & Save"}
            </button>
            <button className="btn-remove-opt" disabled={uploading} onClick={resetStagedFile} type="button">
              <X size={15} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div className="media-upload-status error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
