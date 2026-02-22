/**
 * Template & preset feature public API (PRD-27).
 */

// Components
export { OverridePreviewDialog } from "./OverridePreviewDialog";
export { PresetEditor } from "./PresetEditor";
export { PresetMarketplace } from "./PresetMarketplace";

// Hooks
export {
  presetKeys,
  templateKeys,
  useApplyPreset,
  useCreatePreset,
  useCreateTemplate,
  useDeletePreset,
  useDeleteTemplate,
  useMarketplace,
  usePreset,
  usePresetRatings,
  usePresets,
  usePreviewApply,
  useRatePreset,
  useTemplate,
  useTemplates,
  useUpdatePreset,
  useUpdateTemplate,
} from "./hooks/use-presets";

// Types
export type {
  CreatePreset,
  CreatePresetRating,
  CreateTemplate,
  MarketplaceSortBy,
  OverrideDiff,
  Preset,
  PresetRating,
  PresetWithRating,
  Scope,
  Template,
  UpdatePreset,
  UpdateTemplate,
} from "./types";

export { MAX_DESCRIPTION_LEN, MAX_NAME_LEN, MAX_RATING, MIN_RATING } from "./types";
