/**
 * Centralized copy for video upload success messages (PRD-169 Requirement 1.12).
 *
 * Having both strings in one file gives future translations a single anchor
 * and ensures the multipart upload dialog, server-path dialog, and batch
 * import UI all agree on wording.
 */

export const UPLOAD_SUCCESS_COPY = {
  ready: "Video uploaded and ready",
  processing: "Video uploaded — processing for playback",
} as const;

/**
 * Pick the right success message based on the backend-returned transcode state.
 *
 * The backend returns `transcode_state === 'completed'` for already-H.264
 * sources (no work needed) and `'pending'` for non-browser-compatible codecs
 * that will be transcoded in the background.
 */
export function uploadSuccessMessage(
  transcodeState: "pending" | "in_progress" | "completed" | "failed" | undefined | null,
): string {
  return transcodeState === "completed"
    ? UPLOAD_SUCCESS_COPY.ready
    : UPLOAD_SUCCESS_COPY.processing;
}
