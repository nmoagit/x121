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

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/composite/useToast";

import { parseFilename } from "@/features/characters/tabs/matchDroppedVideos";
import { useSceneCatalog } from "@/features/scene-catalog/hooks/use-scene-catalog";
import { useTracks } from "@/features/scene-catalog/hooks/use-tracks";
import { sceneKeys } from "@/features/scenes/hooks/useCharacterScenes";
import { imageVariantKeys } from "@/features/images/hooks/use-image-variants";
import type { ImageVariant } from "@/features/images/types";
import type { Scene } from "@/features/scenes/types";
import { api } from "@/lib/api";

import type { Character, CharacterDropPayload } from "../types";
import { useBulkCreateCharacters, useProjectCharacters } from "./use-project-characters";
import {
  createSceneForCharacter,
  importVideoClip,
  uploadImageVariant,
} from "../lib/bulk-asset-upload";

/* --------------------------------------------------------------------------
   Progress types
   -------------------------------------------------------------------------- */

export interface ImportProgress {
  phase: "creating" | "uploading-images" | "importing-videos" | "done";
  current: number;
  total: number;
  errors: string[];
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useCharacterImport(projectId: number) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const bulkCreate = useBulkCreateCharacters(projectId);
  const { data: characters } = useProjectCharacters(projectId);
  const { data: sceneCatalog } = useSceneCatalog();
  const { data: tracks } = useTracks();

  const [importNames, setImportNames] = useState<string[]>([]);
  const [importPayloads, setImportPayloads] = useState<CharacterDropPayload[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const browseFolderRef = useRef<(() => void) | null>(null);

  /* --- Legacy name-only handlers --- */

  function handleImportDrop(names: string[]) {
    setImportNames(names);
    setImportPayloads([]);
    setImportOpen(true);
  }

  function handleImportConfirm(names: string[], groupId?: number) {
    bulkCreate.mutate(
      { names, group_id: groupId },
      {
        onSuccess: () => {
          setImportOpen(false);
          setImportNames([]);
        },
      },
    );
  }

  /* --- Asset-aware handlers --- */

  function handleFolderDrop(payloads: CharacterDropPayload[]) {
    setImportPayloads(payloads);
    setImportNames(payloads.map((p) => p.rawName));
    setImportOpen(true);
  }

  const handleImportConfirmWithAssets = useCallback(
    async (
      newPayloads: CharacterDropPayload[],
      existingPayloads: CharacterDropPayload[],
      groupId?: number,
    ) => {
      const errors: string[] = [];
      const nameToIdMap = new Map<string, number>();

      // Phase 1: Create new characters
      const newNames = newPayloads.map((p) => p.rawName);
      let createdCharacters: Character[] = [];

      if (newNames.length > 0) {
        setImportProgress({
          phase: "creating",
          current: 0,
          total: newNames.length,
          errors: [],
        });

        try {
          createdCharacters = await bulkCreate.mutateAsync({
            names: newNames,
            group_id: groupId,
          });
          for (const char of createdCharacters) {
            nameToIdMap.set(char.name.toLowerCase(), char.id);
          }
        } catch (err) {
          errors.push(`Failed to create characters: ${String(err)}`);
          setImportProgress(null);
          setImportOpen(false);
          addToast({ message: "Character import failed", variant: "error" });
          return;
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
          errors.push(`Could not find existing character "${payload.rawName}"`);
        }
      }

      // Combine all payloads that have a resolved character ID
      const allPayloads = [...newPayloads, ...existingPayloads];
      const imageAssets = allPayloads.flatMap((p) => {
        const charId = nameToIdMap.get(p.rawName.toLowerCase());
        if (!charId) return [];
        return p.assets
          .filter((a) => a.kind === "image")
          .map((a) => ({ charId, asset: a }));
      });

      const videoAssets = allPayloads.flatMap((p) => {
        const charId = nameToIdMap.get(p.rawName.toLowerCase());
        if (!charId) return [];
        return p.assets
          .filter((a) => a.kind === "video")
          .map((a) => ({ charId, asset: a, charName: p.rawName }));
      });

      // Phase 3: Upload images (skip variant_types that already exist)
      if (imageAssets.length > 0) {
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
            const variants = await api.get<ImageVariant[]>(
              `/characters/${cid}/image-variants`,
            );
            const types = new Set(
              variants
                .map((v) => v.variant_type?.toLowerCase())
                .filter((t): t is string => t != null),
            );
            existingVariantTypes.set(cid, types);
          } catch {
            // If fetch fails, proceed without skip-check for this character
            existingVariantTypes.set(cid, new Set());
          }
        }

        let skippedImages = 0;
        for (let i = 0; i < imageAssets.length; i++) {
          const { charId, asset } = imageAssets[i]!;

          // Skip if this variant_type already exists for the character
          const existing = existingVariantTypes.get(charId);
          if (existing?.has(asset.category.toLowerCase())) {
            skippedImages++;
            setImportProgress((prev) =>
              prev ? { ...prev, current: i + 1, errors: [...errors] } : null,
            );
            continue;
          }

          try {
            await uploadImageVariant(charId, asset.file, asset.category);
            // Mark as existing so subsequent dupes in the same batch are skipped
            existing?.add(asset.category.toLowerCase());
          } catch (err) {
            errors.push(`Image upload failed for "${asset.file.name}": ${String(err)}`);
          }
          setImportProgress((prev) =>
            prev ? { ...prev, current: i + 1, errors: [...errors] } : null,
          );
        }

        if (skippedImages > 0) {
          errors.push(
            `${skippedImages} image${skippedImages > 1 ? "s" : ""} skipped (variant type already exists)`,
          );
        }
      }

      // Phase 4: Import videos
      if (videoAssets.length > 0) {
        setImportProgress({
          phase: "importing-videos",
          current: 0,
          total: videoAssets.length,
          errors,
        });

        const trackSlugs = tracks?.map((t) => t.slug) ?? [];

        for (let i = 0; i < videoAssets.length; i++) {
          const { charId, asset, charName } = videoAssets[i]!;
          try {
            const parsed = parseFilename(asset.file.name, trackSlugs);

            // Look up scene_type_id from catalog by slug
            const sceneType = sceneCatalog?.find(
              (st) => st.slug === parsed.sceneSlug,
            );
            if (!sceneType) {
              errors.push(
                `No scene type "${parsed.sceneSlug}" for video "${asset.file.name}" (${charName})`,
              );
              continue;
            }

            // Look up track_id
            const track = tracks?.find((t) => t.slug === parsed.trackSlug) ?? null;
            const trackId = track?.id ?? null;

            // Find existing scene or create one
            const existingScenes = await api.get<Scene[]>(
              `/characters/${charId}/scenes`,
            );
            let scene = existingScenes.find(
              (s) =>
                s.scene_type_id === sceneType.id && s.track_id === trackId,
            );

            if (!scene) {
              const sceneId = await createSceneForCharacter(
                charId,
                sceneType.id,
                trackId,
                null,
              );
              scene = { id: sceneId } as Scene;
            }

            await importVideoClip(scene.id, asset.file);
          } catch (err) {
            errors.push(
              `Video import failed for "${asset.file.name}" (${charName}): ${String(err)}`,
            );
          }
          setImportProgress((prev) =>
            prev ? { ...prev, current: i + 1, errors: [...errors] } : null,
          );
        }
      }

      // Phase 5: Done — invalidate queries and show summary
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
        queryClient.invalidateQueries({ queryKey: imageVariantKeys.all }),
        queryClient.invalidateQueries({ queryKey: sceneKeys.all }),
      ]);

      setImportOpen(false);
      setImportNames([]);
      setImportPayloads([]);
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
      if (vidCount > 0) parts.push(`${vidCount} video${vidCount > 1 ? "s" : ""} imported`);

      if (errors.length > 0) {
        addToast({
          message: `Import done with ${errors.length} error${errors.length > 1 ? "s" : ""}. ${parts.join(", ")}.`,
          variant: "warning",
        });
      } else {
        addToast({ message: parts.join(", "), variant: "success" });
      }
    },
    [bulkCreate, characters, sceneCatalog, tracks, projectId, queryClient],
  );

  function closeImport() {
    setImportOpen(false);
  }

  function browseFolder() {
    browseFolderRef.current?.();
  }

  const isImporting = importProgress !== null && importProgress.phase !== "done";

  return {
    importNames,
    importPayloads,
    importOpen,
    importProgress,
    handleImportDrop,
    handleImportConfirm,
    handleFolderDrop,
    handleImportConfirmWithAssets,
    closeImport,
    bulkCreatePending: bulkCreate.isPending || isImporting,
    browseFolderRef,
    browseFolder,
  };
}
