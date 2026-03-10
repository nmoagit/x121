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
 * Format a 0-1 value as a percentage string.
 *
 * Examples:
 * - formatPercent(0.852)    => "85.2%"
 * - formatPercent(0.852, 0) => "85%"
 * - formatPercent(1)        => "100.0%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a cent amount as a dollar string.
 *
 * Examples:
 * - formatCents(1234)  => "$12.34"
 * - formatCents(0)     => "$0.00"
 * - formatCents(50)    => "$0.50"
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Return a YYYY-MM-DD date string for N days ago (date-only, no time).
 *
 * Useful for API query parameters that accept date-only values.
 */
export function daysAgoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Return a full ISO 8601 timestamp string for N days ago.
 *
 * Useful for API query parameters that accept full timestamps.
 */
export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Convert a snake_case key to Title Case.
 *
 * Examples:
 * - snakeCaseToTitle("first_name") => "First Name"
 * - snakeCaseToTitle("a2c4_model") => "A2c4 Model"
 */
export function snakeCaseToTitle(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

/**
 * Generate an underscore-delimited slug (snake_case) from a name.
 *
 * Used for entity slugs that follow the database convention (e.g. tracks,
 * scene catalogue entries) where the slug column uses underscores.
 */
export function generateSnakeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
