/**
 * Convert a frame number to a timecode string "HH:MM:SS:FF".
 */
export function frameToTimecode(frame: number, fps: number): string {
  if (fps <= 0) return "00:00:00:00";

  const totalSeconds = frame / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(frame % fps);

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
    frames.toString().padStart(2, "0"),
  ].join(":");
}

/**
 * Parse a timecode string "HH:MM:SS:FF" to a frame number.
 */
export function timecodeToFrame(timecode: string, fps: number): number {
  if (fps <= 0) return 0;

  const parts = timecode.split(":");
  if (parts.length !== 4) return 0;

  const nums = parts.map(Number);
  if (nums.some(Number.isNaN)) return 0;

  const totalSeconds = nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
  return Math.round(totalSeconds * fps) + nums[3]!;
}

/**
 * Convert a frame number to seconds (start of frame's display duration).
 */
export function frameToSeconds(frame: number, fps: number): number {
  if (fps <= 0) return 0;
  return frame / fps;
}

/**
 * Time to seek to so the video reliably lands ON the given frame.
 *
 * Uses mid-frame time (`(frame + 0.5) / fps`) because HTMLVideoElement.currentTime
 * tends to snap to the nearest decodable boundary, and seeking to the exact
 * start-of-frame time (`frame / fps`) often lands on the previous frame.
 * Mid-frame targeting keeps any snapping within frame N.
 */
export function frameToSeekTime(frame: number, fps: number): number {
  if (fps <= 0) return 0;
  return (frame + 0.5) / fps;
}

/**
 * Convert seconds to a frame number.
 *
 * Adds a tiny epsilon before flooring so that `secondsToFrame(frameToSeconds(n), fps)`
 * round-trips to `n` instead of `n - 1` on values where float multiplication
 * undershoots (e.g. `50/24 * 24 === 49.999999…`).
 */
export function secondsToFrame(seconds: number, fps: number): number {
  if (fps <= 0) return 0;
  // +1e-6 corrects IEEE-754 undershoot (e.g. 50/24*24 === 49.999…) so floor returns the intended frame.
  return Math.floor(seconds * fps + 1e-6);
}

/**
 * Format seconds as a display string "M:SS" or "H:MM:SS".
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Pad a frame number to a fixed width (default 5 digits for up to 99999 frames).
 * Uses non-breaking spaces so monospace fonts keep alignment.
 */
export function padFrame(frame: number, width = 5): string {
  return String(frame).padStart(width, "\u2007"); // figure space (same width as digit in monospace)
}
