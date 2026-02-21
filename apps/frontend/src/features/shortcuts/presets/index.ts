export { defaultPreset } from "./default";
export { premierePreset } from "./premiere";
export { resolvePreset } from "./resolve";
export { avidPreset } from "./avid";
export { oneHandedReviewBindings } from "./oneHandedReview";

import { defaultPreset } from "./default";
import { premierePreset } from "./premiere";
import { resolvePreset } from "./resolve";
import { avidPreset } from "./avid";

/** All available presets keyed by name. */
export const presets: Record<string, Record<string, string>> = {
  default: defaultPreset,
  premiere: premierePreset,
  resolve: resolvePreset,
  avid: avidPreset,
};
