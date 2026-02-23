/**
 * Format a byte count into a human-readable string.
 *
 * Examples:
 * - formatBytes(0) => "0 B"
 * - formatBytes(1024) => "1.00 KB"
 * - formatBytes(1_073_741_824) => "1.00 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, units.length - 1);

  if (index === 0) return `${bytes} B`;
  return `${(bytes / k ** index).toFixed(2)} ${units[index]}`;
}

/**
 * Format a date string into a locale-friendly short date/time.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a date string into a locale-friendly short date (no time).
 *
 * Example: "Feb 21, 2026"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a duration in milliseconds into a human-readable string.
 *
 * Examples:
 * - formatDuration(0)          => "0s"
 * - formatDuration(45_000)     => "45s"
 * - formatDuration(90_000)     => "1m 30s"
 * - formatDuration(3_723_000)  => "1h 2m"
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format an arbitrary value for display in UI (diffs, tables, previews).
 *
 * - `null`/`undefined` -> `"(none)"`
 * - Arrays -> comma-separated elements
 * - Objects -> JSON string
 * - Primitives -> `String(value)`
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Format a countdown from now to a future date.
 *
 * Returns strings like "3d 4h", "2h 15m", "expired".
 */
export function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format a bytes-per-second speed into a human-readable string.
 *
 * Examples:
 * - formatSpeed(0)           => ""
 * - formatSpeed(800)         => "800 B/s"
 * - formatSpeed(1_500_000)   => "1.4 MB/s"
 */
export function formatSpeed(bps: number | null): string {
  if (!bps || bps <= 0) return "";
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1_024) return `${(bps / 1_024).toFixed(1)} KB/s`;
  return `${bps} B/s`;
}

/**
 * Estimate time remaining given downloaded bytes, total bytes, and speed.
 *
 * Returns strings like "45s", "3m", "1.2h", or "" when unknown.
 */
export function estimateEta(downloaded: number, total: number | null, bps: number | null): string {
  if (!total || !bps || bps <= 0) return "";
  const remaining = total - downloaded;
  if (remaining <= 0) return "";
  const secs = Math.ceil(remaining / bps);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.ceil(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

/**
 * Generate a URL-safe slug from a title string.
 *
 * NOTE: The backend has a canonical `generate_slug()` in `core/src/wiki.rs`
 * that produces the authoritative slug. This frontend version is for
 * preview only — the server always generates the final slug on save.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
