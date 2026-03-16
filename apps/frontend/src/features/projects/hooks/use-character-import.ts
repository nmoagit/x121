/**
 * Shared hook for drag-and-drop character import flow.
 *
 * Encapsulates the import state, handlers, and bulk-create mutation
 * so that both ProjectCharactersTab and ProjectGroupsTab can share
 * identical import behavior without duplicating code.
 *
 * Supports two modes:
 * - Name-only (legacy): creates characters from name list
 * - Asset-aware: creates characters + uploads images/videos from folders
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { useToast } from "@/components/composite/useToast";

import { useActivityConsoleStore } from "@/features/activity-console/stores/useActivityConsoleStore";
import type { ActivityLogEntry } from "@/features/activity-console/types";
import { flattenMetadata } from "@/features/characters/lib/metadata-flatten";
import { generateMetadata } from "@/features/characters/lib/metadata-transform";
import {
  extractCharacterHint,
  matchesCharacterName,
  parseFilename,
} from "@/features/characters/tabs/matchDroppedVideos";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/characters/types";
import { fetchVariantTypeSet, imageVariantKeys } from "@/features/images/hooks/use-image-variants";
import { useSceneCatalogue } from "@/features/scene-catalogue/hooks/use-scene-catalogue";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { sceneKeys } from "@/features/scenes/hooks/useCharacterScenes";
import type { Scene } from "@/features/scenes/types";
import { sceneHasVideo } from "@/features/scenes/types";
import { api } from "@/lib/api";
import { limitConcurrency } from "@/lib/async-utils";
import { readFileAsJson } from "@/lib/file-types";

import {
  createSceneForCharacter,
  importVideoClip,
  uploadImageVariant,
} from "../lib/bulk-asset-upload";
import type { Character, CharacterDropPayload, CharacterGroup, DroppedAsset, FolderDropResult, ImportHashSummary } from "../types";
import { useBulkCreateCharacters, useProjectCharacters } from "./use-project-characters";
import { sha256File } from "@/lib/hash";
import {
  partitionCharacterFiles,
  type FileAssignments,
  type UnmatchedCharacterFiles,
} from "@/features/characters/hooks/useCharacterImportBase";

/* --------------------------------------------------------------------------
   Progress types
   -------------------------------------------------------------------------- */

export interface ImportProgress {
  phase: "creating" | "uploading-images" | "uploading-metadata" | "importing-videos" | "done";
  current: number;
  total: number;
  errors: string[];
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/** Build an ActivityLogEntry for import events. */
function importLogEntry(
  level: ActivityLogEntry["level"],
  message: string,
  projectId: number,
  fields?: Record<string, unknown>,
): ActivityLogEntry {
  // Also log to browser console for debugging
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
    entity_type: "character_import",
    project_id: projectId,
  };
}

export function useCharacterImport(projectId: number) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  /** Add a log entry to the activity console store (always uses latest state). */
  const addLogEntry = (entry: ActivityLogEntry) => {
    useActivityConsoleStore.getState().addEntry(entry);
  };
  const openConsoleOnLive = () => {
    const state = useActivityConsoleStore.getState();
    state.setActiveTab("live");
    if (!state.isOpen) state.togglePanel();
  };
  const bulkCreate = useBulkCreateCharacters(projectId);
  const { data: characters } = useProjectCharacters(projectId);
  const { data: sceneCatalogue } = useSceneCatalogue();
  const { data: tracks } = useTracks();

  const [importNames, setImportNames] = useState<string[]>([]);
  const [importPayloads, setImportPayloads] = useState<CharacterDropPayload[]>([]);
  const [importResult, setImportResult] = useState<FolderDropResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [hashSummary, setHashSummary] = useState<ImportHashSummary | null>(null);
  const [unmatchedFiles, setUnmatchedFiles] = useState<UnmatchedCharacterFiles[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const browseFolderRef = useRef<(() => void) | null>(null);

  /* --- Legacy name-only handlers --- */

  function handleImportDrop(names: string[]) {
    setImportNames(names);
    setImportPayloads([]);
    setImportOpen(true);
  }

  function handleImportConfirm(names: string[], groupId?: number) {
    addLogEntry(importLogEntry("info", `Import started: ${names.length} character(s) (name-only)`, projectId, {
      names,
    }));
    bulkCreate.mutate(
      { names, group_id: groupId },
      {
        onSuccess: () => {
          addLogEntry(importLogEntry("info", `Import complete: ${names.length} character(s) created`, projectId));
          setImportOpen(false);
          setImportNames([]);
        },
      },
    );
  }

  /* --- Asset-aware handlers --- */

  function handleFolderDrop(result: FolderDropResult) {
    setImportResult(result);
    // Flatten all grouped payloads for the modal's character list
    const allPayloads: CharacterDropPayload[] = [];
    for (const payloads of result.groupedPayloads.values()) {
      allPayloads.push(...payloads);
    }

    // Scan for unmatched files (image/JSON files with non-standard names)
    const unmatched: UnmatchedCharacterFiles[] = [];
    for (const payload of allPayloads) {
      const result = partitionCharacterFiles(payload);
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
        // On error, clear hashing state — import still works without dedup
        setHashSummary(null);
      });
    } else {
      setHashSummary(null);
    }
  }

  /** Hash all importable assets (images + videos) and check against backend. */
  async function computeAndCheckHashes(payloads: CharacterDropPayload[]) {
    // Collect all assets (images + videos)
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

    // Hash all files
    const hashes = await Promise.all(
      allAssets.map(({ asset }) => sha256File(asset.file)),
    );

    // Store hashes on assets
    for (let i = 0; i < allAssets.length; i++) {
      allAssets[i]!.asset.contentHash = hashes[i];
    }

    // Check which hashes already exist in the backend (images + videos)
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
        // Silently ignore — import still works without dedup
      }
    }

    // Mark assets as duplicate/new
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

  const handleImportConfirmWithAssets = useCallback(
    async (
      newPayloads: CharacterDropPayload[],
      existingPayloads: CharacterDropPayload[],
      groupId?: number,
      overwrite = false,
      skipExisting = false,
    ) => {
      // Early return if nothing to import
      if (newPayloads.length === 0 && existingPayloads.length === 0) {
        setImportOpen(false);
        addToast({ message: "Nothing to import", variant: "info" });
        return;
      }

      // Set up abort controller for cancellation
      const abort = new AbortController();
      abortRef.current = abort;

      const totalCount = newPayloads.length + existingPayloads.length;
      addLogEntry(importLogEntry("info", `Import started: ${totalCount} character(s)`, projectId, {
        new: newPayloads.length,
        existing: existingPayloads.length,
      }));
      console.info(
        `[Import] Starting import of ${totalCount} character(s) for project ${projectId}`,
      );

      const errors: string[] = [];
      const nameToIdMap = new Map<string, number>();

      /** Check if the import was aborted; if so, clean up and return true. */
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
        // Still invalidate caches for any work already done
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "characters"] });
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "groups"] });
        queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
        queryClient.invalidateQueries({ queryKey: sceneKeys.all });
        return true;
      };

      /** Reusable progress updater for limitConcurrency callbacks. */
      const onProgress = (done: number) => {
        setImportProgress((prev) =>
          prev ? { ...prev, current: done, errors: [...errors] } : null,
        );
      };

      // Phase 0: Create missing groups (for grouped/project imports)
      const groupNameToId = new Map<string, number>();
      const uniqueGroupNames = [
        ...new Set(
          [...newPayloads, ...existingPayloads]
            .filter((p) => p.groupName)
            .map((p) => p.groupName!),
        ),
      ];

      if (uniqueGroupNames.length > 0) {
        console.info(
          `[Import] Phase 0: Resolving ${uniqueGroupNames.length} group(s): ${uniqueGroupNames.join(", ")}`,
        );
        const existingGroups = await api.get<CharacterGroup[]>(
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
              const created = await api.post<CharacterGroup>(
                `/projects/${projectId}/groups`,
                { name },
              );
              groupNameToId.set(name.toLowerCase(), created.id);
              groupsCreated++;
              console.info(`[Import] Created group "${name}" (id=${created.id})`);
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
          addLogEntry(importLogEntry("info", `Groups resolved: ${groupsCreated} created, ${groupsExisted} existing`, projectId, {
            created: groupsCreated,
            existing: groupsExisted,
          }));
          console.info(
            `[Import] Groups: ${groupsCreated} created, ${groupsExisted} already existed`,
          );
        }
      }

      // Phase 1: Create new characters
      const newNames = newPayloads.map((p) => p.rawName);
      let createdCharacters: Character[] = [];

      if (newNames.length > 0) {
        console.info(
          `[Import] Phase 1: Creating ${newNames.length} character(s)`,
        );
        setImportProgress({
          phase: "creating",
          current: 0,
          total: newNames.length,
          errors: [],
        });

        // Check if payloads have group assignments from folder structure
        const hasGroupAssignments = newPayloads.some((p) => p.groupName);

        if (hasGroupAssignments) {
          // Per-group bulk creation
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
              createdCharacters.push(...created);
            }
          } catch (err) {
            { const msg = `Failed to create characters: ${String(err)}`; errors.push(msg); addLogEntry(importLogEntry("error", msg, projectId)); }
            setImportProgress(null);
            setImportOpen(false);
            addToast({ message: "Character import failed", variant: "error" });
            return;
          }
        } else {
          // Single bulk creation (existing behavior)
          try {
            createdCharacters = await bulkCreate.mutateAsync({
              names: newNames,
              group_id: groupId,
            });
            for (const char of createdCharacters) {
              nameToIdMap.set(char.name.toLowerCase(), char.id);
            }
          } catch (err) {
            { const msg = `Failed to create characters: ${String(err)}`; errors.push(msg); addLogEntry(importLogEntry("error", msg, projectId)); }
            setImportProgress(null);
            setImportOpen(false);
            addToast({ message: "Character import failed", variant: "error" });
            return;
          }
        }
      }

      // Phase 2: Resolve existing character IDs
      for (const payload of existingPayloads) {
        const existing = characters?.find(
          (c) => c.name.toLowerCase() === payload.rawName.toLowerCase(),
        );
        if (existing) {
          nameToIdMap.set(payload.rawName.toLowerCase(), existing.id);
        } else {
          { const msg = `Could not find existing character "${payload.rawName}"`; errors.push(msg); addLogEntry(importLogEntry("error", msg, projectId)); }
        }
      }

      // Combine all payloads that have a resolved character ID
      const allPayloads = [...newPayloads, ...existingPayloads];

      // Check for filename-to-character mismatches
      for (const payload of allPayloads) {
        const charId = nameToIdMap.get(payload.rawName.toLowerCase());
        if (!charId) continue;
        for (const asset of payload.assets) {
          const hint = extractCharacterHint(asset.file.name);
          if (hint && !matchesCharacterName(hint, payload.rawName)) {
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

      const videoAssets = allPayloads.flatMap((p) => {
        const charId = nameToIdMap.get(p.rawName.toLowerCase());
        if (!charId) return [];
        return p.assets
          .filter((a) => a.kind === "video")
          .map((a) => ({ charId, asset: a, charName: p.rawName }));
      });

      if (createdCharacters.length > 0) {
        addLogEntry(importLogEntry("info", `Created ${createdCharacters.length} character(s)`, projectId, {
          names: createdCharacters.map((c) => c.name),
        }));
      }
      console.info(
        `[Import] Phase 1 complete: ${createdCharacters.length} character(s) created`,
      );

      // Phase 3: Upload images (skip variant_types that already exist)
      if (wasAborted()) return;
      if (imageAssets.length > 0) {
        console.info(`[Import] Phase 2: Uploading ${imageAssets.length} image(s)`);
        setImportProgress({
          phase: "uploading-images",
          current: 0,
          total: imageAssets.length,
          errors,
        });

        // Fetch existing variant_types per character to avoid duplicates
        const existingVariantTypes = new Map<number, Set<string>>();
        const uniqueCharIds = [...new Set(imageAssets.map((a) => a.charId))];
        for (const cid of uniqueCharIds) {
          try {
            existingVariantTypes.set(cid, await fetchVariantTypeSet(cid));
          } catch {
            // If fetch fails, proceed without skip-check for this character
            existingVariantTypes.set(cid, new Set());
          }
        }

        let skippedImages = 0;
        const imageTasks = imageAssets.map(({ charId, asset, charName }) => () => {
          if (abort.signal.aborted) return Promise.resolve("skipped" as const);
          const existing = existingVariantTypes.get(charId);
          if (!overwrite && existing?.has(asset.category.toLowerCase())) {
            skippedImages++;
            addLogEntry(importLogEntry("debug", `${asset.file.name} skipped for ${charName} (${asset.category} already exists)`, projectId, {
              file: asset.file.name, character: charName, variant_type: asset.category,
            }));
            return Promise.resolve("skipped" as const);
          }
          return uploadImageVariant(charId, asset.file, asset.category).then(() => {
            existing?.add(asset.category.toLowerCase());
            addLogEntry(importLogEntry("info", `${asset.file.name} imported for ${charName}`, projectId, {
              file: asset.file.name, character: charName, variant_type: asset.category,
            }));
            return "uploaded" as const;
          });
        });

        const imageResults = await limitConcurrency(imageTasks, 3, onProgress);

        for (let i = 0; i < imageResults.length; i++) {
          const r = imageResults[i]!;
          if (r.status === "rejected") {
            const msg = `Image upload failed for "${imageAssets[i]!.asset.file.name}" (${imageAssets[i]!.charName}): ${String(r.reason)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId, {
              file: imageAssets[i]!.asset.file.name, character: imageAssets[i]!.charName,
            }));
          }
        }

        const uploadedImages = imageResults.filter((r) => r.status === "fulfilled" && r.value === "uploaded").length;
        const failedImages = imageResults.filter((r) => r.status === "rejected").length;
        addLogEntry(importLogEntry(
          failedImages > 0 ? "warn" : "info",
          `Images: ${uploadedImages} uploaded${skippedImages > 0 ? `, ${skippedImages} skipped` : ""}${failedImages > 0 ? `, ${failedImages} failed` : ""}`,
          projectId,
          { uploaded: uploadedImages, skipped: skippedImages, failed: failedImages },
        ));

        if (skippedImages > 0) {
          addLogEntry(importLogEntry("info", `${skippedImages} image${skippedImages > 1 ? "s" : ""} skipped (variant type already exists)`, projectId));
        }
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
        console.info(
          `[Import] Phase 3: Uploading metadata for ${metadataPayloads.length} character(s)`,
        );
        setImportProgress({
          phase: "uploading-metadata",
          current: 0,
          total: metadataPayloads.length,
          errors,
        });

        const metadataTasks = metadataPayloads.map((payload) => async () => {
          if (abort.signal.aborted) return "skipped" as const;
          const charId = nameToIdMap.get(payload.rawName.toLowerCase())!;

          // Skip if character already has metadata and skipExisting is on
          if (skipExisting) {
            const existing = characters?.find((c) => c.id === charId);
            if (existing?.metadata && Object.keys(existing.metadata).length > 0) {
              skippedMetadata++;
              return "skipped" as const;
            }
          }

          const draft: Record<string, unknown> = {};

          // Parse all available JSON files with validation
          const [bioData, tovData, metaData] = await Promise.all([
            payload.bioJson ? readFileAsJson(payload.bioJson) : null,
            payload.tovJson ? readFileAsJson(payload.tovJson) : null,
            payload.metadataJson ? readFileAsJson(payload.metadataJson) : null,
          ]);

          // Validate JSON parse results — report invalid files
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

          // bio.json + tov.json → generate + flatten (lower priority)
          if (bioData || tovData) {
            const generated = generateMetadata(bioData, tovData, payload.rawName);
            const flat = flattenMetadata(generated);
            Object.assign(draft, flat);
          }

          // metadata.json → flatten and merge (higher priority, overwrites bio/tov keys)
          if (metaData) {
            const flat = flattenMetadata(metaData);
            Object.assign(draft, flat);
          }

          // If no valid JSON data at all, skip the API call
          if (Object.keys(draft).length === 0 && !bioData && !tovData) {
            return "skipped" as const;
          }

          // Store raw sources (matching CharacterMetadataTab pattern)
          if (bioData) draft[SOURCE_KEY_BIO] = bioData;
          if (tovData) draft[SOURCE_KEY_TOV] = tovData;

          await api.put(`/characters/${charId}/metadata`, draft);
          metadataUploaded++;
          const sources = [payload.bioJson && "bio.json", payload.tovJson && "tov.json", payload.metadataJson && "metadata.json"].filter(Boolean).join(", ");
          addLogEntry(importLogEntry("info", `Metadata (${sources}) imported for ${payload.rawName}`, projectId, {
            character: payload.rawName, sources,
          }));
          return "uploaded" as const;
        });

        const metadataResults = await limitConcurrency(metadataTasks, 3, onProgress);

        for (let i = 0; i < metadataResults.length; i++) {
          const r = metadataResults[i]!;
          if (r.status === "rejected") {
            const msg = `Metadata upload failed for "${metadataPayloads[i]!.rawName}": ${String(r.reason)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId, {
              character: metadataPayloads[i]!.rawName,
            }));
          }
        }

        addLogEntry(importLogEntry(
          invalidJsonCount > 0 ? "warn" : "info",
          `Metadata: ${metadataUploaded} uploaded${skippedMetadata > 0 ? `, ${skippedMetadata} skipped` : ""}${invalidJsonCount > 0 ? `, ${invalidJsonCount} invalid JSON` : ""}`,
          projectId,
          { uploaded: metadataUploaded, skipped: skippedMetadata, invalid: invalidJsonCount },
        ));

        if (invalidJsonCount > 0) {
          addToast({
            message: `${invalidJsonCount} JSON file${invalidJsonCount > 1 ? "s" : ""} failed validation and ${invalidJsonCount > 1 ? "were" : "was"} skipped`,
            variant: "warning",
          });
        }
      }

      // Phase 4: Import videos
      if (wasAborted()) return;
      let skippedVideos = 0;
      if (videoAssets.length > 0) {
        console.info(`[Import] Phase 4: Importing ${videoAssets.length} video(s)`);
        setImportProgress({
          phase: "importing-videos",
          current: 0,
          total: videoAssets.length,
          errors,
        });

        const trackSlugs = tracks?.map((t) => t.slug) ?? [];

        const videoTasks = videoAssets.map(({ charId, asset, charName }) => async () => {
          if (abort.signal.aborted) return "skipped" as const;
          const parsed = parseFilename(asset.file.name, trackSlugs);

          // Look up scene_type_id from catalogue by slug
          const sceneType = sceneCatalogue?.find((st) => st.slug === parsed.sceneSlug);
          if (!sceneType) {
            const msg = `No scene type "${parsed.sceneSlug}" for video "${asset.file.name}" (${charName})`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId, {
              file: asset.file.name, character: charName, sceneSlug: parsed.sceneSlug,
            }));
            return "skipped" as const;
          }

          // Look up track_id
          const track = tracks?.find((t) => t.slug === parsed.trackSlug) ?? null;
          const trackId = track?.id ?? null;

          // Find existing scene or create one
          const existingScenes = await api.get<Scene[]>(`/characters/${charId}/scenes`);
          let scene = existingScenes.find(
            (s) => s.scene_type_id === sceneType.id && s.track_id === trackId,
          );

          // Skip if scene already has video and skipExisting is on
          if (skipExisting && scene && sceneHasVideo(scene)) {
            skippedVideos++;
            return "skipped" as const;
          }

          if (!scene) {
            const sceneId = await createSceneForCharacter(charId, sceneType.id, trackId, null);
            scene = { id: sceneId } as Scene;
          }

          await importVideoClip(scene.id, asset.file);
          addLogEntry(importLogEntry("info", `${asset.file.name} imported for ${charName}`, projectId, {
            file: asset.file.name, character: charName, scene_type: parsed.sceneSlug, track: parsed.trackSlug,
          }));
          return "uploaded" as const;
        });

        const videoResults = await limitConcurrency(videoTasks, 2, onProgress);

        for (let i = 0; i < videoResults.length; i++) {
          const r = videoResults[i]!;
          if (r.status === "rejected") {
            const msg = `Video import failed for "${videoAssets[i]!.asset.file.name}" (${videoAssets[i]!.charName}): ${String(r.reason)}`;
            errors.push(msg);
            addLogEntry(importLogEntry("error", msg, projectId, {
              file: videoAssets[i]!.asset.file.name, character: videoAssets[i]!.charName,
            }));
          }
        }

        const uploadedVideos = videoResults.filter((r) => r.status === "fulfilled" && r.value === "uploaded").length;
        const failedVideos = videoResults.filter((r) => r.status === "rejected").length;
        addLogEntry(importLogEntry(
          failedVideos > 0 ? "warn" : "info",
          `Videos: ${uploadedVideos} imported${skippedVideos > 0 ? `, ${skippedVideos} skipped` : ""}${failedVideos > 0 ? `, ${failedVideos} failed` : ""}`,
          projectId,
          { uploaded: uploadedVideos, skipped: skippedVideos, failed: failedVideos },
        ));
      }

      // Phase 5: Done — invalidate queries and show summary
      if (wasAborted()) return;
      abortRef.current = null;
      setImportProgress({
        phase: "done",
        current: 0,
        total: 0,
        errors,
      });

      // Invalidate all relevant caches
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["projects", projectId, "characters"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["projects", projectId, "groups"],
        }),
        queryClient.invalidateQueries({ queryKey: imageVariantKeys.all }),
        queryClient.invalidateQueries({ queryKey: sceneKeys.all }),
      ]);

      setImportOpen(false);
      setImportNames([]);
      setImportPayloads([]);
      setImportResult(null);
      setImportProgress(null);

      // Summary toast
      const created = createdCharacters.length;
      const imgCount = imageAssets.length;
      const vidCount = videoAssets.length;
      const existingCount = existingPayloads.length;

      const parts: string[] = [];
      if (created > 0) parts.push(`${created} character${created > 1 ? "s" : ""} created`);
      if (existingCount > 0) parts.push(`${existingCount} existing updated`);
      if (imgCount > 0) parts.push(`${imgCount} image${imgCount > 1 ? "s" : ""} uploaded`);
      if (metadataUploaded > 0) parts.push(`${metadataUploaded} metadata uploaded`);
      if (vidCount > 0) parts.push(`${vidCount} video${vidCount > 1 ? "s" : ""} imported`);
      if (skippedMetadata > 0) parts.push(`${skippedMetadata} metadata skipped`);
      if (skippedVideos > 0) parts.push(`${skippedVideos} video${skippedVideos > 1 ? "s" : ""} skipped`);
      if (uniqueGroupNames.length > 0) parts.push(`${uniqueGroupNames.length} group${uniqueGroupNames.length > 1 ? "s" : ""} resolved`);
      if (invalidJsonCount > 0) parts.push(`${invalidJsonCount} invalid JSON${invalidJsonCount > 1 ? "s" : ""} skipped`);

      // Dump all errors to browser console for debugging
      if (errors.length > 0) {
        console.error(`[Import] ${errors.length} error(s):`, errors);
      }

      addLogEntry(importLogEntry(
        errors.length > 0 ? "warn" : "info",
        `Import complete: ${parts.join(", ")}`,
        projectId,
        { errors: errors.length > 0 ? errors : undefined },
      ));
      console.info(`[Import] Complete: ${parts.join(", ")}${errors.length > 0 ? ` (${errors.length} error${errors.length > 1 ? "s" : ""})` : ""}`);

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
    [bulkCreate, characters, sceneCatalogue, tracks, projectId, queryClient],
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

  /** Merge file assignments from the FileAssignmentModal into import payloads. */
  function resolveUnmatchedFiles(assignments: FileAssignments) {
    setImportPayloads((prev) => {
      return prev.map((payload) => {
        const charAssignment = assignments[payload.rawName];
        if (!charAssignment) return payload;

        // Remove all image assets — replace with user's explicit assignments
        const newAssets = payload.assets.filter((a) => a.kind !== "image");

        if (charAssignment.clothed) {
          newAssets.push({ file: charAssignment.clothed, category: "clothed", kind: "image" });
        }
        if (charAssignment.topless) {
          newAssets.push({ file: charAssignment.topless, category: "topless", kind: "image" });
        }

        const newPayload = { ...payload, assets: newAssets };
        if (charAssignment.bio) newPayload.bioJson = charAssignment.bio;
        if (charAssignment.tov) newPayload.tovJson = charAssignment.tov;

        return newPayload;
      });
    });
    setUnmatchedFiles([]);
    setImportOpen(true);
  }

  function dismissUnmatchedFiles() {
    setUnmatchedFiles([]);
    setImportOpen(true);
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
  };
}
