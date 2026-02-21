/**
 * Device type detection from user agent string (PRD-04).
 *
 * Used as the key for per-device workspace state API calls.
 * Returns "desktop" for unknown or server-side contexts.
 */

import type { DeviceType } from "./types";

/** Detect the current device type from navigator.userAgent. */
export function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";

  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua) && !/tablet/i.test(ua)) return "mobile";
  return "desktop";
}
