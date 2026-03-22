/**
 * Base import hook for avatar folder imports (phases 0-3.5).
 *
 * Handles: group resolution, avatar creation, image upload, and
 * metadata upload. Does NOT handle video import (Phase 4).
 *
 * Used by:
 * - AvatarsPage (no video support)
 * - useAvatarImport (wraps this and adds Phase 4 on top)
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { useToast } from "@/components/composite/useToast";

import { useActivityConsoleStore } from "@/features/activity-console/stores/useActivityConsoleStore";
import type { ActivityLogEntry } from "@/features/activity-console/types";
import { flattenMetadata } from "@/features/avatars/lib/metadata-flatten";
import { generateMetadata } from "@/features/avatars/lib/metadata-transform";
import {
  extractAvatarHint,
  matchesAvatarName,
} from "@/features/avatars/tabs/matchDroppedVideos";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/avatars/types";
import { fetchVariantTypeSet, imageVariantKeys } from "@/features/images/hooks/use-image-variants";
import { api } from "@/lib/api";
import { limitConcurrency } from "@/lib/async-utils";
import { readFileAsJson } from "@/lib/file-types";
import { sha256File } from "@/lib/hash";

import {
  uploadImageVariant,
} from "@/features/projects/lib/bulk-asset-upload";
import type {
  Avatar,
  AvatarDropPayload,
  AvatarGroup,
  DroppedAsset,
  FolderDropResult,
  ImportHashSummary,
} from "@/features/projects/types";
import {
  useBulkCreateAvatars,
  useProjectAvatars,
} from "@/features/projects/hooks/use-project-avatars";

/* --------------------------------------------------------------------------
   Progress types (shared with useAvatarImport)
   -------------------------------------------------------------------------- */

export interface ImportProgress {
  phase: "creating" | "uploading-images" | "uploading-metadata" | "importing-videos" | "done";
  current: number;
  total: number;
  errors: string[];
}

/* --------------------------------------------------------------------------
   Unmatched file types (for FileAssignmentModal)
   -------------------------------------------------------------------------- */

/** Per-avatar file assignment map: dynamic image slot names + fixed bio/tov slots. */
export interface AvatarFileSlots {
  /** Dynamic image slots keyed by seed slot name (e.g. "front_clothed", "alt"). */
  images: Record<string, File>;
  bio?: File;
  tov?: File;
}

export interface UnmatchedAvatarFiles {
  avatarName: string;
  imageFiles: File[];
  jsonFiles: File[];
  matched: AvatarFileSlots;
}

export interface FileAssignments {
  [avatarName: string]: AvatarFileSlots;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build an ActivityLogEntry for import events. */
function importLogEntry(
  level: ActivityLogEntry["level"],
  message: string,
  projectId: number,
  fields?: Record<string, unknown>,
): ActivityLogEntry {
  const logFn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logFn(`[Import] ${message}`, fields ?? "");

  return {
    type: "entry",
    timestamp: new Date().toISOString(),
    level,
    source: "api",
    message,
    fields: fields ?? {},
    category: "curated",
    entity_type: "avatar_import",
    project_id: projectId,
  };
}


/**
 * Suggest a seed slot category for a file based on its name.
 * Matches against the provided slot names (from the pipeline's seed_slots).
 * Returns the first matching slot name, or null if no match.
 */
export function suggestImageCategory(filename: string, slotNames?: string[]): string | null {
  const lower = filename.toLowerCase();
  const slots = slotNames ?? [];
  for (const slot of slots) {
    if (lower.includes(slot.toLowerCase())) return slot;
  }
  return null;
}

/** Normalize a category string (identity — no hardcoded slug mapping). */
function normalizeImageCategory(category: string): string {
  return category;
}

/**
 * Partition files in a payload into matched (recognized names) and unmatched.
 * Returns null if there are no unmatched files.
 */
export function partitionAvatarFiles(
  payload: AvatarDropPayload,
  knownSlotNames?: string[],
): UnmatchedAvatarFiles | null {
  const matchedImages: Record<string, File> = {};
  const unmatchedImages: File[] = [];
  const unmatchedJsons: File[] = [];
  const knownSlots = new Set(knownSlotNames ?? []);

  // Check image assets — match by category against known seed slot names
  for (const asset of payload.assets) {
    if (asset.kind === "image") {
      const cat = asset.category.toLowerCase();
      if (knownSlots.size === 0 || knownSlots.has(cat)) {
        matchedImages[cat] = asset.file;
      } else {
        unmatchedImages.push(asset.file);
      }
    }
  }

  const matched: AvatarFileSlots = { images: matchedImages };

  // Check JSON files
  if (payload.bioJson) matched.bio = payload.bioJson;
  if (payload.tovJson) matched.tov = payload.tovJson;

  if (unmatchedImages.length === 0 && unmatchedJsons.length === 0) {
    return null;
  }

  return {
    avatarName: payload.rawName,
    imageFiles: unmatchedImages,
    jsonFiles: unmatchedJsons,
    matched,
  };
}

/* --------------------------------------------------------------------------
   Hook options
   -------------------------------------------------------------------------- */

export interface UseAvatarImportBaseOptions {
  /** Called when files don't match recognized names. Return assignments to merge. */
  onUnmatchedFiles?: (files: UnmatchedAvatarFiles[]) => Promise<FileAssignments | null>;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useAvatarImportBase(projectId: number, _options?: UseAvatarImportBaseOptions) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const addLogEntry = (entry: ActivityLogEntry) => {
    useActivityConsoleStore.getState().addEntry(entry);
  };
  const openConsoleOnLive = () => {
    const state = useActivityConsoleStore.getState();
    state.setActiveTab("live");
    if (!state.isOpen) state.togglePanel();
  };
  const bulkCreate = useBulkCreateAvatars(projectId);
  const { data: avatars } = useProjectAvatars(projectId);

  const [importNames, setImportNames] = useState<string[]>([]);
  const [importPayloads, setImportPayloads] = useState<AvatarDropPayload[]>([]);
  const [importResult, setImportResult] = useState<FolderDropResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [hashSummary, setHashSummary] = useState<ImportHashSummary | null>(null);
  const [unmatchedFiles, setUnmatchedFiles] = useState<UnmatchedAvatarFiles[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const browseFolderRef = useRef<(() => void) | null>(null);

  /* --- Legacy name-only handlers --- */

  function handleImportDrop(names: string[]) {
    setImportNames(names);
    setImportPayloads([]);
    setImportOpen(true);
  }

  function handleImportConfirm(names: string[], groupId?: number) {
    addLogEntry(importLogEntry("info", `Import started: ${names.length} avatar(s) (name-only)`, projectId, {
      names,
    }));
    bulkCreate.mutate(
      { names, group_id: groupId },
      {
        onSuccess: () => {
          addLogEntry(importLogEntry("info", `Import complete: ${names.length} avatar(s) created`, projectId));
          setImportOpen(false);
          setImportNames([]);
        },
      },
    );
  }

  /* --- Asset-aware handlers --- */

  function handleFolderDrop(result: FolderDropResult) {
    setImportResult(result);
    const allPayloads: AvatarDropPayload[] = [];
    for (const payloads of result.groupedPayloads.values()) {
      allPayloads.push(...payloads);
    }

    // Scan for unmatched files
    const unmatched: UnmatchedAvatarFiles[] = [];
    for (const payload of allPayloads) {
      const result = partitionAvatarFiles(payload);
      if (result) unmatched.push(result);
    }
    setImportPayloads(allPayloads);
    setImportNames(allPayloads.map((p) => p.rawName));

    // If there are unmatched files, show the assignment modal FIRST.
    // The import confirmation modal opens only after unmatched files are resolved.
    if (unmatched.length > 0) {
      setUnmatchedFiles(unmatched);
    } else {
      setImportOpen(true);
    }

    // Check all assets for duplicates in background
    const allAssets = allPayloads.flatMap((p) => p.assets);
    if (allAssets.length > 0) {
      setHashSummary({ totalFiles: allAssets.length, duplicateFiles: 0, newFiles: 0, isHashing: true });
      computeAndCheckHashes(allPayloads).catch(() => {
        setHashSummary(null);
      });
    } else {
      setHashSummary(null);
    }
  }

  /** Merge file assignments from the FileAssignmentModal into import payloads. */
  function resolveUnmatchedFiles(assignments: FileAssignments) {
    setImportPayloads((prev) => {
      const updated = prev.map((payload) => {
        const charAssignment = assignments[payload.rawName];
        if (!charAssignment) return payload;

        // Remove all image assets for this avatar — they'll be replaced by
        // the user's explicit assignments from the FileAssignmentModal.
        // Keep video assets untouched.
        const newAssets = payload.assets.filter((a) => a.kind !== "image");

        // Add dynamically assigned image slots from the pipeline's seed slots
        for (const [slotName, file] of Object.entries(charAssignment.images)) {
          if (file) {
            newAssets.push({ file, category: slotName, kind: "image" });
          }
        }

        const newPayload = { ...payload, assets: newAssets };

        // Merge assigned JSON files
        if (charAssignment.bio) newPayload.bioJson = charAssignment.bio;
        if (charAssignment.tov) newPayload.tovJson = charAssignment.tov;

        return newPayload;
      });
      return updated;
    });
    setUnmatchedFiles([]);
    // Now open the import confirmation modal
    setImportOpen(true);
  }

  function dismissUnmatchedFiles() {
    setUnmatchedFiles([]);
    // User dismissed without assigning — still open import modal with original payloads
    setImportOpen(true);
  }

  /** Hash all importable assets and check against backend. */
  async function computeAndCheckHashes(payloads: AvatarDropPayload[]) {
    const allAssets: { asset: DroppedAsset }[] = [];
    for (const payload of payloads) {
      for (const asset of payload.assets) {
        allAssets.push({ asset });
      }
    }

    if (allAssets.length === 0) {
      setHashSummary(null);
      return;
    }

    const hashes = await Promise.all(
      allAssets.map(({ asset }) => sha256File(asset.file)),
    );

    for (let i = 0; i < allAssets.length; i++) {
      allAssets[i]!.asset.contentHash = hashes[i];
    }

    const uniqueHashes = [...new Set(hashes.filter(Boolean) as string[])];
    let existingHashSet = new Set<string>();
    if (uniqueHashes.length > 0) {
      try {
        const result = await api.post<{ existing: string[] }>(
          "/image-variants/check-hashes",
          { hashes: uniqueHashes },
        );
        existingHashSet = new Set(result?.existing ?? []);
      } catch {
        // Silently ignore
      }
    }

    let duplicateCount = 0;
    for (let i = 0; i < allAssets.length; i++) {
      const isDup = existingHashSet.has(hashes[i]!);
      allAssets[i]!.asset.isDuplicate = isDup;
      if (isDup) duplicateCount++;
    }

    setImportPayloads([...payloads]);
    setHashSummary({
      totalFiles: allAssets.length,
      duplicateFiles: duplicateCount,
      newFiles: allAssets.length - duplicateCount,
      isHashing: false,
    });
  }

  /**
   * Core import logic: phases 0-3.5.
   * Returns { nameToIdMap, errors, createdAvatars, imageAssets, allPayloads }
   * so callers can add Phase 4 (videos) on top.
   */
  const handleImportConfirmWithAssets = useCallback(
    async (
      newPayloads: AvatarDropPayload[],
      existingPayloads: AvatarDropPayload[],
      groupId?: number,
      overwrite = false,
      skipExisting = false,
    ) => {
      if (newPayloads.length === 0 && existingPayloads.length === 0) {
        setImportOpen(false);
        addToast({ message: "Nothing to import", variant: "info" });
        return;
      }

      const abort = new AbortController();
      abortRef.current = abort;

      const totalCount = newPayloads.length + existingPayloads.length;
      addLogEntry(importLogEntry("info", `Import started: ${totalCount} avatar(s)`, projectId, {
        new: newPayloads.length,
        existing: existingPayloads.length,
      }));

      const errors: string[] = [];
      const nameToIdMap = new Map<string, number>();

      const wasAborted = () => {
        if (!abort.signal.aborted) return false;
        addLogEntry(importLogEntry("warn", "Import stopped by user", projectId));
        addToast({ message: "Import stopped", variant: "warning" });
        setImportProgress(null);
        setImportOpen(false);
        setImportNames([]);
        setImportPayloads([]);
        setImportResult(null);
        abortRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "avatars"] });
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "groups"] });
        queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
        return true;
      };

      const onProgress = (done: number) => {
        setImportProgress((prev) =>
          prev ? { ...prev, current: done, errors: [...errors] } : null,
        );
      };

      // Phase 0: Create missing groups
      const groupNameToId = new Map<string, number>();
      const uniqueGroupNames = [
        ...new Set(
          [...newPayloads, ...existingPayloads]
            .filter((p) => p.groupName)
            .map((p) => p.groupName!),
        ),
      ];

      if (uniqueGroupNames.length > 0) {
        const existingGroups = await api.get<AvatarGroup[]>(
          `/projects/${projectId}/groups`,
        );
        for (const g of existingGroups) {
          groupNameToId.set(g.name.toLowerCase(), g.id);
        }
        let groupsCreated = 0;
        let groupsExisted = 0;
        for (const name of uniqueGroupNames) {
          if (!groupNameToId.has(name.toLowerCase())) {
            try {
              const created = await api.post<AvatarGroup>(
                `/projects/${projectId}/groups`,
                { name },
              );
              groupNameToId.set(name.toLowerCase(), created.id);
              groupsCreated++;
            } catch (err) {
              const msg = `Failed to create group "${name}": ${String(err)}`;
              errors.push(msg);
              addLogEntry(importLogEntry("error", msg, projectId));
              addToast({ message: msg, variant: "error" });
            }
          } else {
            groupsExisted++;
          }
        }
        if (groupsCreated > 0 || groupsExisted > 0) {
          addLogEntry(importLogEntry("info", `Groups resolved: ${groupsCreated} created, ${groupsExisted} existing`, projectId));
        }
      }

      // Phase 1: Create new avatars
      const newNames = newPayloads.map((p) => p.rawName);
      let createdAvatars: Avatar[] = [];

      if (newNames.length > 0) {
        setImportProgress({
          phase: "creating",
          current: 0,
          total: newNames.length,
          errors: [],
        });

        const hasGroupAssignments = newPayloads.some((p) => p.groupName);

        if (hasGroupAssignments) {
          const byGroup = new Map<number | undefined, string[]>();
          for (const p of newPayloads) {
            const gId = p.groupName
              ? groupNameToId.get(p.groupName.toLowerCase())
              : groupId;
            const arr = byGroup.get(gId) ?? [];
            arr.push(p.rawName);
            byGroup.set(gId, arr);
          }

          try {
            for (const [gId, names] of byGroup) {
              const created = await bulkCreate.mutateAsync({
                names,
                group_id: gId,
              });
              for (const char of created) {
                nameToIdMap.set(char.name.toLowerCase(), char.id);
              }
              createdAvatars.push(...created);
            }
          } catch (err) {
            const msg = `Failed to create avatars: ${String(err)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
            setImportProgress(null);
            setImportOpen(false);
            addToast({ message: "Avatar import failed", variant: "error" });
            return;
          }
        } else {
          try {
            createdAvatars = await bulkCreate.mutateAsync({
              names: newNames,
              group_id: groupId,
            });
            for (const char of createdAvatars) {
              nameToIdMap.set(char.name.toLowerCase(), char.id);
            }
          } catch (err) {
            const msg = `Failed to create avatars: ${String(err)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
            setImportProgress(null);
            setImportOpen(false);
            addToast({ message: "Avatar import failed", variant: "error" });
            return;
          }
        }
      }

      // Phase 2: Resolve existing avatar IDs
      for (const payload of existingPayloads) {
        const existing = avatars?.find(
          (c) => c.name.toLowerCase() === payload.rawName.toLowerCase(),
        );
        if (existing) {
          nameToIdMap.set(payload.rawName.toLowerCase(), existing.id);
        } else {
          const msg = `Could not find existing avatar "${payload.rawName}"`;
          errors.push(msg);
          addLogEntry(importLogEntry("error", msg, projectId));
        }
      }

      const allPayloads = [...newPayloads, ...existingPayloads];

      // Check for filename-to-avatar mismatches
      for (const payload of allPayloads) {
        const charId = nameToIdMap.get(payload.rawName.toLowerCase());
        if (!charId) continue;
        for (const asset of payload.assets) {
          const hint = extractAvatarHint(asset.file.name);
          if (hint && !matchesAvatarName(hint, payload.rawName)) {
            const msg = `"${asset.file.name}" may belong to "${hint}", not "${payload.rawName}"`;
            errors.push(`Warning: ${msg}`);
            addLogEntry(importLogEntry("warn", msg, projectId, {
              file: asset.file.name, expected: hint, assigned: payload.rawName,
            }));
          }
        }
      }

      const imageAssets = allPayloads.flatMap((p) => {
        const charId = nameToIdMap.get(p.rawName.toLowerCase());
        if (!charId) return [];
        return p.assets.filter((a) => a.kind === "image").map((a) => ({ charId, asset: a, charName: p.rawName }));
      });

      if (createdAvatars.length > 0) {
        addLogEntry(importLogEntry("info", `Created ${createdAvatars.length} avatar(s)`, projectId, {
          names: createdAvatars.map((c) => c.name),
        }));
      }

      // Phase 3: Upload images
      if (wasAborted()) return;
      if (imageAssets.length > 0) {
        setImportProgress({
          phase: "uploading-images",
          current: 0,
          total: imageAssets.length,
          errors,
        });

        const existingVariantTypes = new Map<number, Set<string>>();
        const uniqueCharIds = [...new Set(imageAssets.map((a) => a.charId))];
        for (const cid of uniqueCharIds) {
          try {
            existingVariantTypes.set(cid, await fetchVariantTypeSet(cid));
          } catch {
            existingVariantTypes.set(cid, new Set());
          }
        }

        let skippedImages = 0;
        const imageTasks = imageAssets.map(({ charId, asset, charName }) => () => {
          if (abort.signal.aborted) return Promise.resolve("skipped" as const);
          // Normalize category to canonical variant_type
          const variantType = normalizeImageCategory(asset.category);
          const existing = existingVariantTypes.get(charId);
          if (!overwrite && existing?.has(variantType.toLowerCase())) {
            skippedImages++;
            addLogEntry(importLogEntry("debug", `${asset.file.name} skipped for ${charName} (${variantType} already exists)`, projectId));
            return Promise.resolve("skipped" as const);
          }
          return uploadImageVariant(charId, asset.file, variantType).then(() => {
            existing?.add(variantType.toLowerCase());
            addLogEntry(importLogEntry("info", `${asset.file.name} imported for ${charName}`, projectId));
            return "uploaded" as const;
          });
        });

        const imageResults = await limitConcurrency(imageTasks, 3, onProgress);

        for (let i = 0; i < imageResults.length; i++) {
          const r = imageResults[i]!;
          if (r.status === "rejected") {
            const msg = `Image upload failed for "${imageAssets[i]!.asset.file.name}" (${imageAssets[i]!.charName}): ${String(r.reason)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
          }
        }

        const uploadedImages = imageResults.filter((r) => r.status === "fulfilled" && r.value === "uploaded").length;
        const failedImages = imageResults.filter((r) => r.status === "rejected").length;
        addLogEntry(importLogEntry(
          failedImages > 0 ? "warn" : "info",
          `Images: ${uploadedImages} uploaded${skippedImages > 0 ? `, ${skippedImages} skipped` : ""}${failedImages > 0 ? `, ${failedImages} failed` : ""}`,
          projectId,
        ));
      }

      if (wasAborted()) return;

      // Phase 3.5: Upload metadata from JSON files
      const metadataPayloads = allPayloads.filter((p) => {
        const charId = nameToIdMap.get(p.rawName.toLowerCase());
        return charId && (p.bioJson || p.tovJson || p.metadataJson);
      });

      let metadataUploaded = 0;
      let skippedMetadata = 0;
      let invalidJsonCount = 0;
      if (metadataPayloads.length > 0) {
        setImportProgress({
          phase: "uploading-metadata",
          current: 0,
          total: metadataPayloads.length,
          errors,
        });

        const metadataTasks = metadataPayloads.map((payload) => async () => {
          if (abort.signal.aborted) return "skipped" as const;
          const charId = nameToIdMap.get(payload.rawName.toLowerCase())!;

          if (skipExisting) {
            const existing = avatars?.find((c) => c.id === charId);
            if (existing?.metadata && Object.keys(existing.metadata).length > 0) {
              skippedMetadata++;
              return "skipped" as const;
            }
          }

          const draft: Record<string, unknown> = {};

          const [bioData, tovData, metaData] = await Promise.all([
            payload.bioJson ? readFileAsJson(payload.bioJson) : null,
            payload.tovJson ? readFileAsJson(payload.tovJson) : null,
            payload.metadataJson ? readFileAsJson(payload.metadataJson) : null,
          ]);

          if (payload.bioJson && bioData === null) {
            const msg = `Invalid JSON: bio.json for "${payload.rawName}" — file skipped`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
            invalidJsonCount++;
          }
          if (payload.tovJson && tovData === null) {
            const msg = `Invalid JSON: tov.json for "${payload.rawName}" — file skipped`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
            invalidJsonCount++;
          }
          if (payload.metadataJson && metaData === null) {
            const msg = `Invalid JSON: metadata.json for "${payload.rawName}" — file skipped`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
            invalidJsonCount++;
          }

          if (bioData || tovData) {
            const generated = generateMetadata(bioData, tovData, payload.rawName);
            const flat = flattenMetadata(generated);
            Object.assign(draft, flat);
          }

          if (metaData) {
            const flat = flattenMetadata(metaData);
            Object.assign(draft, flat);
          }

          if (Object.keys(draft).length === 0 && !bioData && !tovData) {
            return "skipped" as const;
          }

          if (bioData) draft[SOURCE_KEY_BIO] = bioData;
          if (tovData) draft[SOURCE_KEY_TOV] = tovData;

          await api.put(`/avatars/${charId}/metadata`, draft);
          metadataUploaded++;
          const sources = [payload.bioJson && "bio.json", payload.tovJson && "tov.json", payload.metadataJson && "metadata.json"].filter(Boolean).join(", ");
          addLogEntry(importLogEntry("info", `Metadata (${sources}) imported for ${payload.rawName}`, projectId));
          return "uploaded" as const;
        });

        const metadataResults = await limitConcurrency(metadataTasks, 3, onProgress);

        for (let i = 0; i < metadataResults.length; i++) {
          const r = metadataResults[i]!;
          if (r.status === "rejected") {
            const msg = `Metadata upload failed for "${metadataPayloads[i]!.rawName}": ${String(r.reason)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId));
          }
        }

        addLogEntry(importLogEntry(
          invalidJsonCount > 0 ? "warn" : "info",
          `Metadata: ${metadataUploaded} uploaded${skippedMetadata > 0 ? `, ${skippedMetadata} skipped` : ""}${invalidJsonCount > 0 ? `, ${invalidJsonCount} invalid JSON` : ""}`,
          projectId,
        ));

        if (invalidJsonCount > 0) {
          addToast({
            message: `${invalidJsonCount} JSON file${invalidJsonCount > 1 ? "s" : ""} failed validation and ${invalidJsonCount > 1 ? "were" : "was"} skipped`,
            variant: "warning",
          });
        }
      }

      // Phase done (no videos in base hook)
      if (wasAborted()) return;
      abortRef.current = null;
      setImportProgress({
        phase: "done",
        current: 0,
        total: 0,
        errors,
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["projects", projectId, "avatars"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["projects", projectId, "groups"],
        }),
        queryClient.invalidateQueries({ queryKey: imageVariantKeys.all }),
      ]);

      setImportOpen(false);
      setImportNames([]);
      setImportPayloads([]);
      setImportResult(null);
      setImportProgress(null);

      // Summary toast
      const created = createdAvatars.length;
      const imgCount = imageAssets.length;
      const existingCount = existingPayloads.length;

      const parts: string[] = [];
      if (created > 0) parts.push(`${created} avatar${created > 1 ? "s" : ""} created`);
      if (existingCount > 0) parts.push(`${existingCount} existing updated`);
      if (imgCount > 0) parts.push(`${imgCount} image${imgCount > 1 ? "s" : ""} uploaded`);
      if (metadataUploaded > 0) parts.push(`${metadataUploaded} metadata uploaded`);
      if (skippedMetadata > 0) parts.push(`${skippedMetadata} metadata skipped`);
      if (uniqueGroupNames.length > 0) parts.push(`${uniqueGroupNames.length} group${uniqueGroupNames.length > 1 ? "s" : ""} resolved`);
      if (invalidJsonCount > 0) parts.push(`${invalidJsonCount} invalid JSON${invalidJsonCount > 1 ? "s" : ""} skipped`);

      if (errors.length > 0) {
        console.error(`[Import] ${errors.length} error(s):`, errors);
      }

      addLogEntry(importLogEntry(
        errors.length > 0 ? "warn" : "info",
        `Import complete: ${parts.join(", ")}`,
        projectId,
        { errors: errors.length > 0 ? errors : undefined },
      ));

      if (errors.length > 0) {
        addToast({
          message: `Import done with ${errors.length} error${errors.length > 1 ? "s" : ""}. ${parts.join(", ")}. See console for details.`,
          variant: "warning",
        });
        openConsoleOnLive();
      } else {
        addToast({ message: parts.join(", "), variant: "success" });
      }
    },
    [bulkCreate, avatars, projectId, queryClient],
  );

  function closeImport() {
    setImportOpen(false);
    setHashSummary(null);
  }

  function abortImport() {
    abortRef.current?.abort();
  }

  function browseFolder() {
    browseFolderRef.current?.();
  }

  const isImporting = importProgress !== null && importProgress.phase !== "done";

  return {
    importNames,
    importPayloads,
    importResult,
    importOpen,
    importProgress,
    hashSummary,
    unmatchedFiles,
    handleImportDrop,
    handleImportConfirm,
    handleFolderDrop,
    handleImportConfirmWithAssets,
    closeImport,
    abortImport,
    resolveUnmatchedFiles,
    dismissUnmatchedFiles,
    bulkCreatePending: bulkCreate.isPending || isImporting,
    browseFolderRef,
    browseFolder,
    avatars,
  };
}
