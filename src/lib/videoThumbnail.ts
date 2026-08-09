/**
 * Grabs a single frame from a video URL and returns it as a JPEG Blob, so a
 * reel can auto-generate a thumbnail when the creator didn't upload one.
 *
 * Note: the video must be same-origin or CORS-enabled (our S3/Cloudinary URLs
 * are), otherwise the canvas is tainted and export throws — callers should
 * treat a rejection as "no auto thumbnail, ask for a manual one".
 */
export async function captureVideoThumbnail(
  videoUrl: string,
  atSeconds = 1
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };

    const onMeta = () => {
      // Seek a little in so we don't grab a black leading frame; clamp to clip.
      const target = Math.min(atSeconds, Math.max(0, (video.duration || 1) - 0.1));
      try {
        video.currentTime = target;
      } catch {
        fail("Could not seek the video to capture a thumbnail.");
      }
    };

    const onSeeked = () => {
      if (settled) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("Canvas is not supported in this browser.");
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              settled = true;
              cleanup();
              resolve(blob);
            } else {
              fail("Could not export the captured frame.");
            }
          },
          "image/jpeg",
          0.82
        );
      } catch {
        fail("The video is not accessible for thumbnail capture (CORS).");
      }
    };

    const onError = () => fail("Could not load the video to capture a thumbnail.");

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    // Safety timeout so we never hang the publish flow.
    setTimeout(() => fail("Timed out generating a thumbnail."), 15000);
  });
}

/** Formats seconds as m:ss for reel duration fields. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:30";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
