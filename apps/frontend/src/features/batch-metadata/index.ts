/**
 * Batch Metadata Operations feature public API (PRD-88).
 */

// Components
export { BatchMetadataPanel } from "./BatchMetadataPanel";
export { FieldOperationForm } from "./FieldOperationForm";
export { OperationHistory } from "./OperationHistory";
export { OperationPreview } from "./OperationPreview";
export { SearchReplaceForm } from "./SearchReplaceForm";

// Hooks
export {
  batchMetadataKeys,
  useBatchMetadataOperation,
  useBatchMetadataOperations,
  useCreatePreview,
  useExecuteOperation,
  useUndoOperation,
} from "./hooks/use-batch-metadata";

// Types
export type {
  BatchMetadataOperation,
  BatchOperationStatus,
  BatchOperationType,
  CreateBatchMetadataRequest,
  FieldOperationParams,
  FieldOperationType,
  ListBatchMetadataParams,
  SearchReplaceParams,
} from "./types";
