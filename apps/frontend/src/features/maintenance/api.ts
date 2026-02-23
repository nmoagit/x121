/**
 * Bulk Data Maintenance API functions (PRD-18).
 */

import { api } from "@/lib/api";

import type {
  BulkOperation,
  ExecutionResponse,
  FindReplaceRequest,
  OperationListParams,
  PreviewResponse,
  RepathRequest,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BASE_PATH = "/admin/maintenance";

/* --------------------------------------------------------------------------
   Find / Replace
   -------------------------------------------------------------------------- */

/** Preview a find/replace operation without applying changes. */
export function previewFindReplace(
  body: FindReplaceRequest,
): Promise<PreviewResponse> {
  return api.post<PreviewResponse>(`${BASE_PATH}/find-replace/preview`, body);
}

/** Execute a previously previewed find/replace operation. */
export function executeFindReplace(id: number): Promise<ExecutionResponse> {
  return api.post<ExecutionResponse>(
    `${BASE_PATH}/find-replace/${id}/execute`,
  );
}

/* --------------------------------------------------------------------------
   Re-path
   -------------------------------------------------------------------------- */

/** Preview a re-path operation without applying changes. */
export function previewRepath(body: RepathRequest): Promise<PreviewResponse> {
  return api.post<PreviewResponse>(`${BASE_PATH}/repath/preview`, body);
}

/** Execute a previously previewed re-path operation. */
export function executeRepath(id: number): Promise<ExecutionResponse> {
  return api.post<ExecutionResponse>(`${BASE_PATH}/repath/${id}/execute`);
}

/* --------------------------------------------------------------------------
   Undo
   -------------------------------------------------------------------------- */

/** Undo a completed bulk operation. */
export function undoOperation(id: number): Promise<ExecutionResponse> {
  return api.post<ExecutionResponse>(`${BASE_PATH}/${id}/undo`);
}

/* --------------------------------------------------------------------------
   History & Detail
   -------------------------------------------------------------------------- */

/** List bulk operations with optional filters. */
export function listOperations(
  params?: OperationListParams,
): Promise<BulkOperation[]> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.operation_type) qs.set("operation_type", params.operation_type);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  const path = query ? `${BASE_PATH}/history?${query}` : `${BASE_PATH}/history`;
  return api.get<BulkOperation[]>(path);
}

/** Get a single bulk operation by ID. */
export function getOperation(id: number): Promise<BulkOperation> {
  return api.get<BulkOperation>(`${BASE_PATH}/${id}`);
}
