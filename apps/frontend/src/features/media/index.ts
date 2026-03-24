/**
 * Media variant management barrel export (PRD-21).
 */

// Components
export { SourceImageUpload } from "./SourceImageUpload";
export { VariantGallery } from "./VariantGallery";
export { ExternalEditFlow } from "./ExternalEditFlow";
export { VariantHistory } from "./VariantHistory";

// Hooks
export {
  mediaVariantKeys,
  useMediaVariants,
  useMediaVariant,
  useVariantHistory,
  useCreateMediaVariant,
  useUpdateMediaVariant,
  useDeleteMediaVariant,
  useApproveVariant,
  useRejectVariant,
  useExportVariant,
  useGenerateVariants,
} from "./hooks/use-media-variants";

// Types
export type {
  MediaVariant,
  MediaVariantStatusId,
  Provenance,
  CreateMediaVariantInput,
  UpdateMediaVariantInput,
  GenerateVariantsInput,
} from "./types";

export {
  MEDIA_VARIANT_STATUS,
  MEDIA_VARIANT_STATUS_LABEL,
  PROVENANCE,
  PROVENANCE_LABEL,
  VALID_IMAGE_FORMATS,
} from "./types";
