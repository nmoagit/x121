/**
 * Bulk Data Maintenance feature public API (PRD-18).
 */

// Components
export { FindReplacePanel } from "./FindReplacePanel";
export { OperationDetail } from "./OperationDetail";
export { OperationsHistory } from "./OperationsHistory";
export { PreviewTable } from "./PreviewTable";
export { RePathPanel } from "./RePathPanel";

// Hooks
export {
  maintenanceKeys,
  useExecuteFindReplace,
  useExecuteRepath,
  useOperation,
  useOperations,
  usePreviewFindReplace,
  usePreviewRepath,
  useUndoOperation,
} from "./hooks";

// API functions
export {
  executeFindReplace,
  executeRepath,
  getOperation,
  listOperations,
  previewFindReplace,
  previewRepath,
  undoOperation,
} from "./api";

// Types
export type {
  BulkOperation,
  BulkOperationStatus,
  BulkOperationType,
  ExecutionResponse,
  FieldInfo,
  FindReplaceRequest,
  OperationListParams,
  PreviewResponse,
  RepathRequest,
} from "./types";
