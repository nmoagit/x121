/**
 * Scene assembly & delivery packaging feature public API (PRD-39).
 */

// Components
export { DeliveryDestinationManager } from "./DeliveryDestinationManager";
export { DeliveryLogViewer } from "./DeliveryLogViewer";
export { ExportHistory } from "./ExportHistory";
export { ExportPanel } from "./ExportPanel";
export { FormatProfileManager } from "./FormatProfileManager";
export { ValidationReport } from "./ValidationReport";

// Hooks
export {
  deliveryKeys,
  useCreateProfile,
  useCreateWatermark,
  useDeleteProfile,
  useDeleteWatermark,
  useDeliveryExport,
  useDeliveryExports,
  useDeliveryValidation,
  useOutputFormatProfile,
  useOutputFormatProfiles,
  useStartAssembly,
  useUpdateProfile,
  useUpdateWatermark,
  useWatermarkSetting,
  useWatermarkSettings,
} from "./hooks/use-delivery";

export {
  destinationKeys,
  useCreateDestination,
  useDeleteDestination,
  useDeliveryDestinations,
  useUpdateDestination,
} from "./hooks/use-delivery-destinations";

export { deliveryLogKeys, useDeliveryLogs } from "./hooks/use-delivery-logs";
export {
  deliveryStatusKeys,
  useDeliveryStatus,
} from "./hooks/use-delivery-status";

// Types
export type {
  AssemblyStartedResponse,
  CharacterDeliveryStatus,
  CreateDeliveryDestination,
  CreateOutputFormatProfile,
  CreateWatermarkSetting,
  DeliveryDestination,
  DeliveryExport,
  DeliveryLog,
  DeliveryValidationResponse,
  OutputFormatProfile,
  StartAssemblyRequest,
  UpdateDeliveryDestination,
  UpdateOutputFormatProfile,
  UpdateWatermarkSetting,
  ValidationIssue,
  WatermarkSetting,
} from "./types";

export {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_VARIANT,
  DESTINATION_TYPE_LABELS,
  EXPORT_STATUS_LABELS,
  EXPORT_STATUS_VARIANT,
  LOG_LEVEL_BADGE_VARIANT,
  SEVERITY_COLORS,
} from "./types";
