/**
 * Consume the server-side directory-scan import SSE stream (PRD-165).
 *
 * POST /api/v1/directory-scan/import-assets streams `progress` events as
 * each phase runs and a final `done` event with the summary. This hook
 * bridges that stream onto the existing `ImportProgress` shape used by
 * `ImportProgressBar` so server imports render with the same UI as
 * browser imports.
 */

import { useCallback, useRef, useState } from "react";

import { api } from "@/lib/api";

import type { ImportProgress } from "@/features/projects/hooks/use-avatar-import";
import type { AvatarDropPayload } from "@/features/projects/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary emitted by the server on the `done` SSE event. */
export interface ImportDoneSummary {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  avatars_created: number;
  groups_created: number;
}

/** Phase strings emitted by the backend orchestrator. */
const PHASE_CREATING_GROUPS = "creating-groups";
const PHASE_CREATING = "creating";
const PHASE_IMAGES = "uploading-images";
const PHASE_METADATA = "uploading-metadata";
const PHASE_VIDEOS = "importing-videos";
const PHASE_DONE = "done";

const IMPORT_ENDPOINT = "/directory-scan/import-assets";

interface UseServerImportOptions {
  pipelineId: number;
  projectId: number;
  onComplete?: (summary: ImportDoneSummary) => void;
  onError?: (message: string) => void;
}

interface UseServerImportResult {
  /** Progress state, shaped for `ImportProgressBar`. `null` when idle. */
  progress: ImportProgress | null;
  /** Final summary from the `done` event, or `null` while running. */
  summary: ImportDoneSummary | null;
  /** Kick off an import. Resolves once the server closes the stream. */
  startImport: (args: StartImportArgs) => Promise<void>;
  /** Abort the in-flight request. */
  cancelImport: () => void;
  /** `true` while an import is in flight. */
  isImporting: boolean;
}

interface StartImportArgs {
  newPayloads: AvatarDropPayload[];
  existingPayloads: AvatarDropPayload[];
  groupId?: number;
  overwrite?: boolean;
  skipExisting?: boolean;
  applyFilenameTags?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useServerImport(
  options: UseServerImportOptions,
): UseServerImportResult {
  const { pipelineId, projectId, onComplete, onError } = options;

  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportDoneSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startImport = useCallback(
    async (args: StartImportArgs) => {
      const controller = new AbortController();
      abortRef.current = controller;

      setIsImporting(true);
      setSummary(null);
      setProgress({ phase: "creating", current: 0, total: 0, errors: [] });

      const body = buildImportRequest(pipelineId, projectId, args);

      let response: Response;
      try {
        response = await api.raw(IMPORT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setProgress(null);
        setIsImporting(false);
        onError?.(message);
        return;
      }

      if (!response.ok || !response.body) {
        const message = `Import request failed: ${response.status} ${response.statusText}`;
        setProgress(null);
        setIsImporting(false);
        onError?.(message);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const errors: string[] = [];
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are delimited by a blank line.
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleFrame(frame, errors, setProgress, (s) => {
              setSummary(s);
              onComplete?.(s);
            });
          }
        }
      } catch (err) {
        // Abort is the common case — don't propagate as an error.
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : String(err);
          onError?.(message);
        }
      } finally {
        setIsImporting(false);
        abortRef.current = null;
      }
    },
    [pipelineId, projectId, onComplete, onError],
  );

  const cancelImport = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsImporting(false);
    setProgress(null);
  }, []);

  return { progress, summary, startImport, cancelImport, isImporting };
}

// ---------------------------------------------------------------------------
// Internal: SSE frame parser
// ---------------------------------------------------------------------------

type ProgressUpdater =
  (updater: (prev: ImportProgress | null) => ImportProgress) => void;

function handleFrame(
  frame: string,
  errorAccumulator: string[],
  setProgress: ProgressUpdater,
  onDone: (summary: ImportDoneSummary) => void,
): void {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (!event || dataLines.length === 0) return;
  const raw = dataLines.join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  switch (event) {
    case "progress":
      applyProgress(parsed, errorAccumulator, setProgress);
      break;
    case "error":
      if (isRecord(parsed) && typeof parsed.message === "string") {
        errorAccumulator.push(parsed.message);
      }
      break;
    case "done":
      if (isDoneSummary(parsed)) {
        onDone(parsed);
      }
      break;
  }
}

function applyProgress(
  parsed: unknown,
  errors: string[],
  setProgress: ProgressUpdater,
): void {
  if (!isRecord(parsed)) return;
  const phase = typeof parsed.phase === "string" ? parsed.phase : "creating";
  const current = typeof parsed.current === "number" ? parsed.current : 0;
  const total = typeof parsed.total === "number" ? parsed.total : 0;
  const mapped = mapPhase(phase);
  if (mapped === null) return;

  setProgress(() => ({
    phase: mapped,
    current,
    total,
    errors: [...errors],
  }));
}

/** Map backend phase strings to the frontend ImportProgress phase enum. */
function mapPhase(phase: string): ImportProgress["phase"] | null {
  switch (phase) {
    case PHASE_CREATING_GROUPS:
    case PHASE_CREATING:
      return "creating";
    case PHASE_IMAGES:
      return "uploading-images";
    case PHASE_METADATA:
      return "uploading-metadata";
    case PHASE_VIDEOS:
      return "importing-videos";
    case PHASE_DONE:
      return "done";
    default:
      return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isDoneSummary(v: unknown): v is ImportDoneSummary {
  return (
    isRecord(v)
    && typeof v.imported === "number"
    && typeof v.skipped === "number"
    && typeof v.failed === "number"
    && Array.isArray(v.errors)
  );
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

/** Convert an `AvatarDropPayload` into the wire-format `ServerAvatarPayload`. */
function mapPayload(payload: AvatarDropPayload): ServerAvatarPayloadDTO {
  const assets: ServerAvatarPayloadDTO["assets"] = [];
  for (const a of payload.assets) {
    if (!a.serverPath) continue;
    assets.push({
      server_path: a.serverPath,
      category: a.category,
      kind: a.kind,
      content_hash: a.contentHash ?? null,
      clip_meta: a.clipMeta
        ? {
            scene_type_slug: a.clipMeta.sceneTypeSlug,
            track_slug: a.clipMeta.trackSlug,
            version: a.clipMeta.version,
            labels: a.clipMeta.labels,
            clip_index: a.clipMeta.clipIndex ?? null,
          }
        : null,
    });
  }

  return {
    raw_name: payload.rawName,
    group_name: payload.groupName ?? null,
    avatar_id: null, // resolved server-side for existing avatars
    assets,
    bio_json_path: payload.bioJsonPath ?? null,
    tov_json_path: payload.tovJsonPath ?? null,
    metadata_json_path: payload.metadataJsonPath ?? null,
  };
}

/** Compose the full import-assets request body. */
function buildImportRequest(
  pipelineId: number,
  projectId: number,
  args: StartImportArgs,
): ImportAssetsRequest {
  return {
    pipeline_id: pipelineId,
    project_id: projectId,
    new_payloads: args.newPayloads.map(mapPayload),
    existing_payloads: args.existingPayloads.map(mapPayload),
    group_id: args.groupId ?? null,
    overwrite: args.overwrite ?? false,
    skip_existing: args.skipExisting ?? false,
    apply_filename_tags: args.applyFilenameTags ?? false,
  };
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface ImportAssetsRequest {
  pipeline_id: number;
  project_id: number;
  new_payloads: ServerAvatarPayloadDTO[];
  existing_payloads: ServerAvatarPayloadDTO[];
  group_id: number | null;
  overwrite: boolean;
  skip_existing: boolean;
  apply_filename_tags: boolean;
}

interface ServerAvatarPayloadDTO {
  raw_name: string;
  group_name: string | null;
  avatar_id: number | null;
  assets: Array<{
    server_path: string;
    category: string;
    kind: "image" | "video";
    content_hash: string | null;
    clip_meta: {
      scene_type_slug: string;
      track_slug: string;
      version: number;
      labels: string[];
      clip_index: number | null;
    } | null;
  }>;
  bio_json_path: string | null;
  tov_json_path: string | null;
  metadata_json_path: string | null;
}

