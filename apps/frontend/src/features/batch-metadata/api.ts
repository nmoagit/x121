/**
 * Batch Metadata Operations API functions (PRD-88).
 */

import { api } from "@/lib/api";

import type {
  BatchMetadataOperation,
  CreateBatchMetadataRequest,
  ListBatchMetadataParams,
} from "./types";

const BASE = "/admin/batch-metadata";

/** List batch metadata operations with optional filters. */
export function fetchOperations(
  params?: ListBatchMetadataParams,
): Promise<BatchMetadataOperation[]> {
  const qs = new URLSearchParams();
  if (params?.project_id != null) qs.set("project_id", String(params.project_id));
  if (params?.operation_type) qs.set("operation_type", params.operation_type);
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return api.get(`${BASE}${query ? `?${query}` : ""}`);
}

/** Get a single batch metadata operation by ID. */
export function fetchOperation(id: number): Promise<BatchMetadataOperation> {
  return api.get(`${BASE}/${id}`);
}

/** Create a preview batch metadata operation. */
export function createPreview(
  input: CreateBatchMetadataRequest,
): Promise<BatchMetadataOperation> {
  return api.post(BASE, input);
}

/** Execute a previewed batch metadata operation. */
export function executeOperation(
  id: number,
): Promise<BatchMetadataOperation> {
  return api.post(`${BASE}/${id}/execute`);
}

/** Undo a completed batch metadata operation. */
export function undoOperation(
  id: number,
): Promise<BatchMetadataOperation> {
  return api.post(`${BASE}/${id}/undo`);
}
