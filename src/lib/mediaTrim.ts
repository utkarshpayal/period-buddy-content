function pickSupportedMimeType(candidates: string[]) {
  if (typeof MediaRecorder === "undefined") {
    return candidates[candidates.length - 1];
  }

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? candidates[candidates.length - 1];
}

export const VIDEO_TRIM_MIME_TYPE = pickSupportedMimeType([
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm"
]);

export const AUDIO_TRIM_MIME_TYPE = pickSupportedMimeType(["audio/webm;codecs=opus", "audio/webm"]);

export function canTrimMedia(element: HTMLMediaElement) {
  return typeof (element as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream === "function";
}

/**
 * Re-encodes the [start, end] window of a playing <video>/<audio> element into
 * a new Blob by capturing its decoded output through MediaRecorder. This is a
 * browser-native trim (no ffmpeg dependency) — it re-plays the clip in the
 * background, so the element is muted for the duration to avoid blaring audio.
 */
export function recordTrimmedMedia(
  element: HTMLMediaElement,
  start: number,
  end: number,
  mimeType: string
): Promise<Blob> {
  const capture = (element as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream;

  if (typeof capture !== "function") {
    return Promise.reject(
      new Error("Trimming isn't supported in this browser. Try Chrome/Edge, or upload without trimming.")
    );
  }

  return new Promise((resolve, reject) => {
    const stream = capture.call(element);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    const wasMuted = element.muted;

    let settled = false;

    const cleanup = () => {
      element.muted = wasMuted;
      element.removeEventListener("timeupdate", onTimeUpdate);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("seeked", onSeeked);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (recorder.state !== "inactive") recorder.stop();
      reject(error);
    };

    const finish = () => {
      element.pause();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    };

    const onTimeUpdate = () => {
      if (element.currentTime >= end) {
        finish();
      }
    };

    const onEnded = () => finish();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => settleReject(new Error("Recording failed while trimming the clip."));

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(new Blob(chunks, { type: mimeType }));
    };

    const onSeeked = () => {
      element.removeEventListener("seeked", onSeeked);
      try {
        recorder.start();
        element.muted = true;
        void element.play().catch((error) => settleReject(error instanceof Error ? error : new Error(String(error))));
      } catch (error) {
        settleReject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    element.addEventListener("timeupdate", onTimeUpdate);
    element.addEventListener("ended", onEnded);
    element.addEventListener("seeked", onSeeked);
    element.currentTime = start;
  });
}
