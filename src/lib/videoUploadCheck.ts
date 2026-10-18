/**
 * Upload-time checks for reel videos, so an admin hears about a file that
 * will be slow to start in the app before it goes live.
 */

/** Above this a reel takes noticeably long to start on mobile data. */
export const REEL_MAX_RECOMMENDED_BYTES = 15 * 1024 * 1024;

/**
 * Walks the top-level MP4/MOV boxes. Returns false when `mdat` (the media)
 * comes before `moov` (the index), which means a player must download the
 * whole file before it can start; true when `moov` is first; null when the
 * file isn't an MP4/MOV or can't be read.
 */
export async function isFastStartMp4(file: Blob): Promise<boolean | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset + 8 <= file.size; i++) {
    const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    let size = header.getUint32(0);
    const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
    if (i === 0 && type !== "ftyp") return null;
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size === 1) {
      if (header.byteLength < 16) return null;
      size = Number(header.getBigUint64(8));
    } else if (size === 0) {
      return null; // box runs to the end of the file
    }
    if (size < 8) return null;
    offset += size;
  }
  return null;
}

/** Human-readable warnings for a reel video about to be uploaded. */
export async function reelVideoWarnings(file: File): Promise<string[]> {
  const warnings: string[] = [];
  if (file.size > REEL_MAX_RECOMMENDED_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    warnings.push(`This video is ${mb} MB. Reels over 15 MB start slowly in the app; export at 720p H.264 to shrink it.`);
  }
  const fastStart = await isFastStartMp4(file).catch(() => null);
  if (fastStart === false) {
    warnings.push(
      "This MP4 isn't web-optimized (the index is at the end), so the whole file must download before it plays. Re-export with \"Fast start\" / \"Optimize for web\" turned on.",
    );
  }
  return warnings;
}
