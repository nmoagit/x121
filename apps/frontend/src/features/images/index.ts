/**
 * Image management barrel export (PRD-21).
 */

// Components
export { SourceImageUpload } from "./SourceImageUpload";
export { VariantGallery } from "./VariantGallery";
export { ExternalEditFlow } from "./ExternalEditFlow";
export { VariantHistory } from "./VariantHistory";

// Hooks
export {
  imageVariantKeys,
  useImageVariants,
  useImageVariant,
  useVariantHistory,
  useCreateImageVariant,
  useUpdateImageVariant,
  useDeleteImageVariant,
  useApproveVariant,
  useRejectVariant,
  useExportVariant,
  useGenerateVariants,
} from "./hooks/use-image-variants";

// Types
export type {
  ImageVariant,
  ImageVariantStatusId,
  Provenance,
  CreateImageVariantInput,
  UpdateImageVariantInput,
  GenerateVariantsInput,
} from "./types";

export {
  IMAGE_VARIANT_STATUS,
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE,
  PROVENANCE_LABEL,
  VALID_IMAGE_FORMATS,
} from "./types";
