/**
 * Map directory-scan results into `AvatarDropPayload[]` so the same
 * `ImportConfirmModal` used for browser drops can confirm scan imports
 * (PRD-165).
 *
 * Scan files come from the server — the browser never holds their bytes —
 * so each mapped asset carries a `serverPath` and a dummy `File` object
 * (empty blob with the correct filename) to satisfy the existing type
 * shape. The server-side import engine uses `serverPath` and ignores the
 * dummy `File`.
 */

import type { AvatarScanGroup, ScanResponse, ScannedFileResponse } from "@/hooks/useDirectoryScan";
import type { AvatarDropPayload, DroppedAsset, ImportHashSummary } from "../types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScanToPayloadResult {
  /** Avatars ready to feed into ImportConfirmModal. */
  payloads: AvatarDropPayload[];
  /** Hash-based dedup summary for ImportConfirmModal's banner. */
  hashSummary: ImportHashSummary;
  /** Files that could not be placed under any avatar — shown separately. */
  unresolved: ScannedFileResponse[];
}

/**
 * Transform a scan response into `AvatarDropPayload[]` for the modal.
 *
 * All image/video files become `DroppedAsset`s with `serverPath` set.
 * bio.json / tov.json / metadata.json are attached to the payload via
 * `bioJsonPath` / `tovJsonPath` / `metadataJsonPath`.
 *
 * The `content_hash` field on each scanned file is carried onto the
 * asset so `ImportConfirmModal` can show the dedup state without
 * re-hashing in the browser.
 */
export function mapScanToPayloads(scan: ScanResponse): ScanToPayloadResult {
  const payloads: AvatarDropPayload[] = scan.avatars.map(mapAvatarGroup);

  const hashSummary = buildHashSummary(payloads);

  return {
    payloads,
    hashSummary,
    unresolved: scan.unresolved,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a single avatar group to a payload. */
function mapAvatarGroup(group: AvatarScanGroup): AvatarDropPayload {
  const assets: DroppedAsset[] = [];
  let bioJsonPath: string | undefined;
  let tovJsonPath: string | undefined;
  let metadataJsonPath: string | undefined;

  for (const file of group.files) {
    if (file.category === "image") {
      assets.push(mapFileToAsset(file));
    } else if (file.category === "video_clip") {
      assets.push(mapFileToAsset(file));
    } else if (file.category === "metadata") {
      const key = file.resolved.metadata_key;
      if (key === "_source_bio") {
        bioJsonPath = file.path;
      } else if (key === "_source_tov") {
        tovJsonPath = file.path;
      } else {
        // metadata.json
        metadataJsonPath = file.path;
      }
    }
    // Speech/voice CSVs are not part of the ImportConfirmModal flow (PRD-165
    // scope) — they stay out of the mapped payloads.
  }

  return {
    rawName: group.avatar_slug,
    assets,
    bioJsonPath,
    tovJsonPath,
    metadataJsonPath,
  };
}

/** Map a single scanned file to a `DroppedAsset`. */
function mapFileToAsset(file: ScannedFileResponse): DroppedAsset {
  const isVideo = file.category === "video_clip";
  const contentHash = file.content_hash ?? undefined;
  const isDuplicate = file.conflict === "duplicate";

  // Category: for images use the resolved variant_type (e.g. "seed"); fall
  // back to the filename stem when no variant was detected. Videos keep
  // the raw filename as category to mirror browser-drop behavior.
  const category = isVideo
    ? file.filename.replace(/\.[^.]+$/, "")
    : (file.resolved.variant_type ?? file.filename.replace(/\.[^.]+$/, ""));

  const clipMeta =
    isVideo && file.resolved.scene_type_slug
      ? {
          sceneTypeSlug: file.resolved.scene_type_slug,
          trackSlug: file.resolved.track_slug ?? "",
          version: file.resolved.version ?? 1,
          labels: file.resolved.labels ?? [],
          clipIndex: file.resolved.clip_index ?? null,
        }
      : undefined;

  return {
    // Dummy File object — the server reads bytes from `serverPath`, not
    // from the browser. Using an empty Blob keeps the type-shape stable.
    file: new File([], file.filename),
    serverPath: file.path,
    category,
    kind: isVideo ? "video" : "image",
    contentHash,
    isDuplicate,
    clipMeta,
  };
}

/** Build an ImportHashSummary from the (already computed) per-file hashes. */
function buildHashSummary(payloads: AvatarDropPayload[]): ImportHashSummary {
  let totalFiles = 0;
  let duplicateFiles = 0;
  let newFiles = 0;

  for (const p of payloads) {
    for (const a of p.assets) {
      totalFiles += 1;
      if (a.isDuplicate) duplicateFiles += 1;
      else newFiles += 1;
    }
  }

  return {
    totalFiles,
    duplicateFiles,
    newFiles,
    isHashing: false,
  };
}
