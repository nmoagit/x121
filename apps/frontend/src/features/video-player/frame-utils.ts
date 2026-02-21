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
 * Convert a frame number to seconds.
 */
export function frameToSeconds(frame: number, fps: number): number {
  if (fps <= 0) return 0;
  return frame / fps;
}

/**
 * Convert seconds to a frame number.
 */
export function secondsToFrame(seconds: number, fps: number): number {
  if (fps <= 0) return 0;
  return Math.floor(seconds * fps);
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
  return `${m}:${s.toString().padStart(2, "0")}`;
}
