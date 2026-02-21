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
