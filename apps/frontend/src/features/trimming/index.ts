/**
 * Segment Trimming & Frame-Level Editing feature public API (PRD-78).
 */

// Components
export { BatchTrim } from "./BatchTrim";
export { QuickTrimPresets } from "./QuickTrimPresets";
export { TrimPreview } from "./TrimPreview";
export { TrimTimeline } from "./TrimTimeline";

// Hooks
export {
  trimmingKeys,
  useActiveTrim,
  useApplyPreset,
  useBatchTrim,
  useCreateTrim,
  useRevertTrim,
  useSeedFrameImpact,
} from "./hooks/use-trimming";

// Types
export type {
  ApplyPresetRequest,
  BatchTrimRequest,
  BatchTrimResponse,
  CreateTrimRequest,
  SeedFrameUpdate,
  SegmentTrim,
  TrimPreset,
} from "./types";

export { TRIM_PRESETS } from "./types";
