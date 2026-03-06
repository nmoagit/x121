/**
 * Shared utilities for triggering file downloads from the browser.
 *
 * Use these instead of hand-rolling the Blob -> createObjectURL -> click -> revokeObjectURL
 * pattern in individual components.
 */

/** Trigger a browser download for an arbitrary Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Serialize `data` as pretty-printed JSON and trigger a download. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, filename);
}
