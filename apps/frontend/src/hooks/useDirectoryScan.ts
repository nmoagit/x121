/**
 * TanStack Query hooks for the unified directory scan API (PRD-155).
 *
 * POST /directory-scan — scan a server directory and classify files
 * POST /directory-scan/import — selectively import scanned files
 */

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Shared types
   -------------------------------------------------------------------------- */

export type FileCategory =
  | "image"
  | "metadata"
  | "speech_json"
  | "speech_csv"
  | "voice_csv"
  | "video_clip"
  | "unknown";

export type ConflictStatus = "new" | "exists" | "duplicate";

export interface ResolvedContext {
  avatar_slug?: string | null;
  variant_type?: string | null;
  scene_type_slug?: string | null;
  track_slug?: string | null;
  version?: number | null;
  clip_index?: number | null;
  labels: string[];
  metadata_key?: string | null;
}

export interface ScannedFileResponse {
  path: string;
  filename: string;
  size_bytes: number;
  category: FileCategory;
  resolved: ResolvedContext;
  conflict: ConflictStatus;
}

export interface AvatarScanGroup {
  avatar_slug: string;
  avatar_id: number | null;
  avatar_name: string | null;
  files: ScannedFileResponse[];
}

export interface ScanSummary {
  total_files: number;
  images: number;
  metadata: number;
  speech_json: number;
  speech_csv: number;
  voice_csv: number;
  video_clips: number;
  unknown: number;
}

export interface ScanResponse {
  avatars: AvatarScanGroup[];
  unresolved: ScannedFileResponse[];
  summary: ScanSummary;
}

export interface ImportSelection {
  file_path: string;
  category: FileCategory;
  action: "import" | "skip" | "replace";
  avatar_id?: number | null;
  resolved: ResolvedContext;
}

export interface ImportResultDetail {
  path: string;
  status: string;
  error?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  replaced: number;
  failed: number;
  details: ImportResultDetail[];
}

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

interface ScanInput {
  path: string;
  pipeline_id: number;
  project_id?: number;
}

interface ImportInput {
  pipeline_id: number;
  selections: ImportSelection[];
}

/** Scan a server directory and return classified file preview. */
export function useDirectoryScan() {
  return useMutation({
    mutationFn: (input: ScanInput) =>
      api.post<ScanResponse>("/directory-scan", input),
  });
}

/** Import selected files from a previous scan. */
export function useDirectoryImport() {
  return useMutation({
    mutationFn: (input: ImportInput) =>
      api.post<ImportResult>("/directory-scan/import", input),
  });
}
