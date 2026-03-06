/**
 * Character scenes tab — grid of scene cards with generation controls (PRD-112).
 *
 * Shows a card for every enabled scene_type × track combination (derived from
 * the three-level merge: catalog → project → character override, cross-joined
 * with catalog tracks). Scenes that already exist display status, segment
 * progress, and a generate button. Scene types without a scene yet show a
 * placeholder card. Supports multi-select with batch generation, one-click
 * "Generate All", and drag-and-drop video import with filename matching.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { Card } from "@/components/composite/Card";
import { useToast } from "@/components/composite/useToast";
import { EmptyState } from "@/components/domain";
import { Grid } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { Checkbox } from "@/components/primitives/Checkbox";
import { useSetToggle } from "@/hooks/useSetToggle";
import { getStreamUrl } from "@/features/video-player";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AlertCircle, EyeOff, Pause, Play, Upload, Video } from "@/tokens/icons";

import { useBatchGenerate } from "@/features/generation/hooks/use-generation";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { findVariantForTrack } from "@/features/images/utils";
import { sourceLabel } from "@/features/scene-catalog/SourceBadge";
import { TrackBadge } from "@/features/scene-catalog/TrackBadge";
import {
  useCharacterSceneSettings,
  useToggleCharacterSceneSetting,
} from "@/features/scene-catalog/hooks/use-character-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalog/hooks/use-expanded-settings";
import { useTracks } from "@/features/scene-catalog/hooks/use-tracks";
import type { ExpandedSceneSetting } from "@/features/scene-catalog/types";
import { useCharacterScenes, useCreateScene } from "@/features/scenes/hooks/useCharacterScenes";
import { clipKeys, useBulkImportClip, useSceneVersions } from "@/features/scenes/hooks/useClipManagement";
import {
  SCENE_STATUS_GENERATING,
  sceneHasVideo,
  sceneStatusBadgeVariant,
  sceneStatusLabel,
} from "@/features/scenes/types";
import type { Scene, SceneVideoVersion } from "@/features/scenes/types";

import { GenerateConfirmModal } from "./GenerateConfirmModal";
import type { GenerateCandidate } from "./GenerateConfirmModal";
import { ImportPreviewModal } from "./ImportPreviewModal";
import { MediaPlaceholder } from "./MediaPlaceholder";
import { matchDroppedVideos } from "./matchDroppedVideos";
import type { MatchResult } from "./matchDroppedVideos";

/* --------------------------------------------------------------------------
   Merged scene slot: one per enabled scene_type × track
   -------------------------------------------------------------------------- */

interface SceneSlot {
  row: ExpandedSceneSetting;
  scene: Scene | null;
  /** Name of the missing seed image when no matching image variant exists. */
  missingVariant: string | null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterScenesTabProps {
  characterId: number;
  projectId: number;
}

export function CharacterScenesTab({ characterId }: CharacterScenesTabProps) {
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useCharacterSceneSettings(characterId);
  const allExpandedRows = useExpandedSettings(settings);
  const { data: scenes, isLoading: scenesLoading } = useCharacterScenes(characterId);
  const { data: tracks } = useTracks();
  const { data: imageVariants } = useImageVariants(characterId);
  const batchGenerate = useBatchGenerate();
  const createScene = useCreateScene(characterId);
  const bulkImport = useBulkImportClip();
  const toggleSetting = useToggleCharacterSceneSetting(characterId);
  const { addToast } = useToast();

  const [selected, toggleSelectItem, setSelected] = useSetToggle<number>();
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<MatchResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [playback, setPlayback] = useState(true);
  /** Timestamp of last drop — used to ignore residual pointer events that close the modal. */
  const dropTimestampRef = useRef(0);

  /* --- generate confirmation modal state --- */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCandidates, setConfirmCandidates] = useState<GenerateCandidate[]>([]);
  /** Stores auto-created scene IDs from "Generate All" so they can be included in the batch. */
  const pendingAutoCreatedRef = useRef<number[]>([]);

  /* --- prevent browser default file-drop navigation --- */
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  /* --- ordered track slugs for filename matching --- */
  const trackSlugs = useMemo(
    () => (tracks ?? []).filter((t) => t.is_active).map((t) => t.slug),
    [tracks],
  );

  /* --- resolve image_variant_id for a track slug --- */
  const resolveVariantId = useCallback(
    (trackSlug: string | null | undefined): number | null => {
      if (!imageVariants || imageVariants.length === 0) return null;
      if (trackSlug) {
        const match = findVariantForTrack(imageVariants, trackSlug);
        return match?.id ?? null;
      }
      // No track specified — need a generic seed image
      const hero = imageVariants.find((v) => v.is_hero);
      return hero?.id ?? imageVariants[0]?.id ?? null;
    },
    [imageVariants],
  );

  /* --- filter to enabled settings only --- */
  const expandedRows = useMemo(
    () => allExpandedRows.filter((r) => r.is_enabled),
    [allExpandedRows],
  );

  const slots = useMemo<SceneSlot[]>(() => {
    if (expandedRows.length === 0) return [];

    // Key scenes by (scene_type_id, track_id) so each track maps to its own scene.
    const sceneByKey = new Map<string, Scene>();
    if (scenes) {
      for (const s of scenes) {
        const key = `${s.scene_type_id}::${s.track_id ?? "null"}`;
        sceneByKey.set(key, s);
      }
    }

    return expandedRows.map((row) => {
      const key = `${row.scene_type_id}::${row.track_id ?? "null"}`;
      const scene = sceneByKey.get(key) ?? null;
      // Check if the required seed image exists — applies to ALL slots
      const variantId = resolveVariantId(row.track_slug);
      const missingVariant =
        variantId === null ? `${row.track_slug ?? "seed"}.png` : null;
      return { row, scene, missingVariant };
    });
  }, [expandedRows, scenes, resolveVariantId]);

  /* --- selectable scene IDs: only scenes with a seed image can be selected for generation --- */
  const selectableSceneIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of slots) {
      if (s.scene !== null && s.missingVariant === null) ids.add(s.scene.id);
    }
    return [...ids];
  }, [slots]);

  /* --- batch-fetch version counts for all existing scenes --- */
  const sceneIds = useMemo(
    () => slots.filter((s) => s.scene !== null).map((s) => s.scene!.id),
    [slots],
  );
  const versionQueries = useQueries({
    queries: sceneIds.map((id) => ({
      queryKey: clipKeys.list(id),
      queryFn: () => api.get<SceneVideoVersion[]>(`/scenes/${id}/versions`),
      enabled: id > 0,
    })),
  });
  /** Set of scene IDs that have at least one video version. */
  const scenesWithVideo = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < sceneIds.length; i++) {
      const data = versionQueries[i]?.data;
      if (data && data.length > 0) set.add(sceneIds[i]!);
    }
    return set;
  }, [sceneIds, versionQueries]);

  /* --- can any slot actually generate? (must have seed image) --- */
  const canGenerateAny = useMemo(
    () => slots.some((s) => s.missingVariant === null),
    [slots],
  );

  /* --- scenes without any video versions --- */
  const missingSceneIds = useMemo(() => {
    const ids: number[] = [];
    for (const slot of slots) {
      if (!slot.scene || slot.missingVariant) continue;
      if (!scenesWithVideo.has(slot.scene.id)) ids.push(slot.scene.id);
    }
    return ids;
  }, [slots, scenesWithVideo]);

  /* --- drag-and-drop: match files and show preview modal --- */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const result = matchDroppedVideos(files, expandedRows, trackSlugs);

      if (result.matched.length === 0) {
        addToast({
          message: `No files matched any scene slots. Unmatched: ${result.unmatched.map((f) => f.name).join(", ")}`,
          variant: "warning",
        });
        return;
      }

      dropTimestampRef.current = Date.now();
      setPendingImport(result);
      setPreviewOpen(true);
    },
    [expandedRows, trackSlugs, addToast],
  );

  /* --- confirm import from preview modal --- */
  const handleConfirmImport = useCallback(async () => {
    if (!pendingImport) return;

    setImporting(true);
    let imported = 0;
    const errors: string[] = [];

    for (const { file, row } of pendingImport.matched) {
      try {
        const existingScene = scenes?.find(
          (s) => s.scene_type_id === row.scene_type_id && s.track_id === (row.track_id ?? null),
        );
        let sceneId: number;

        if (existingScene) {
          sceneId = existingScene.id;
        } else {
          const variantId = resolveVariantId(row.track_slug);
          const newScene = await createScene.mutateAsync({
            scene_type_id: row.scene_type_id,
            image_variant_id: variantId,
            track_id: row.track_id ?? null,
          });
          sceneId = newScene.id;
        }

        await bulkImport.mutateAsync({ sceneId, file });
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        errors.push(`${file.name}: ${msg}`);
      }
    }

    setImporting(false);
    setPreviewOpen(false);
    setPendingImport(null);

    if (imported > 0) {
      addToast({
        message: `Imported ${imported} video${imported !== 1 ? "s" : ""}.${pendingImport.unmatched.length > 0 ? ` ${pendingImport.unmatched.length} unmatched file${pendingImport.unmatched.length !== 1 ? "s" : ""} skipped.` : ""}`,
        variant: "success",
      });
    }
    if (errors.length > 0) {
      addToast({
        message: `Failed to import: ${errors.join(", ")}`,
        variant: "error",
      });
    }
  }, [pendingImport, scenes, resolveVariantId, createScene, bulkImport, addToast]);

  if (settingsLoading || scenesLoading) {
    return <LoadingPane />;
  }

  if (settingsError) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} />}
        title="Failed to load scene settings"
        description={settingsError.message}
      />
    );
  }

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={<Video size={32} />}
        title="No scenes enabled"
        description="Enable scene types in the project's Scene Settings to see them here."
      />
    );
  }

  /* --- selection helpers (only existing scenes can be selected) --- */
  const selectableCount = selectableSceneIds.length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableSceneIds));
    }
  }

  /* --- build candidates list from a set of scene IDs --- */
  function buildCandidates(sceneIds: number[]): GenerateCandidate[] {
    return sceneIds
      .map((id) => {
        const slot = slots.find((s) => s.scene?.id === id);
        if (!slot?.scene) return null;
        return {
          sceneId: id,
          sceneName: slot.row.name,
          trackName: slot.row.track_name ?? null,
          hasVideo: sceneHasVideo(slot.scene),
        } satisfies GenerateCandidate;
      })
      .filter((c): c is GenerateCandidate => c !== null);
  }

  function handleBatchGenerate() {
    if (selected.size === 0) return;
    const candidates = buildCandidates([...selected]);
    const hasExisting = candidates.some((c) => c.hasVideo);
    if (hasExisting) {
      pendingAutoCreatedRef.current = [];
      setConfirmCandidates(candidates);
      setConfirmOpen(true);
    } else {
      // No existing video — generate directly
      batchGenerate.mutate({ scene_ids: [...selected] });
    }
  }

  async function handleGenerateAll() {
    setImporting(true);
    const sceneIds: number[] = [...selectableSceneIds];

    // Auto-create scenes for placeholder slots
    for (const slot of slots) {
      if (slot.scene !== null) continue;
      const variantId = resolveVariantId(slot.row.track_slug);
      if (variantId === null) continue;
      try {
        const newScene = await createScene.mutateAsync({
          scene_type_id: slot.row.scene_type_id,
          image_variant_id: variantId,
          track_id: slot.row.track_id ?? null,
        });
        sceneIds.push(newScene.id);
      } catch {
        addToast({
          message: `Failed to create scene for "${slot.row.name}"`,
          variant: "error",
        });
      }
    }

    setImporting(false);

    if (sceneIds.length === 0) {
      addToast({ message: "No scenes could be created", variant: "warning" });
      return;
    }

    const candidates = buildCandidates(sceneIds);
    const hasExisting = candidates.some((c) => c.hasVideo);
    if (hasExisting) {
      // Store auto-created IDs so they're included even if user deselects overrides
      pendingAutoCreatedRef.current = sceneIds.filter(
        (id) => !selectableSceneIds.includes(id),
      );
      setConfirmCandidates(candidates);
      setConfirmOpen(true);
    } else {
      batchGenerate.mutate({ scene_ids: sceneIds });
    }
  }

  function handleConfirmGenerate(sceneIds: number[]) {
    setConfirmOpen(false);
    setConfirmCandidates([]);
    if (sceneIds.length === 0) return;
    batchGenerate.mutate({ scene_ids: sceneIds });
  }

  function handleSingleGenerate(sceneId: number) {
    batchGenerate.mutate({ scene_ids: [sceneId] });
  }

  function handleSelectMissing() {
    setSelected(new Set(missingSceneIds));
  }

  async function handleSceneVideoDrop(slot: SceneSlot, file: File) {
    let sceneId: number;

    if (slot.scene) {
      sceneId = slot.scene.id;
    } else {
      const variantId = resolveVariantId(slot.row.track_slug);
      try {
        const newScene = await createScene.mutateAsync({
          scene_type_id: slot.row.scene_type_id,
          image_variant_id: variantId,
          track_id: slot.row.track_id ?? null,
        });
        sceneId = newScene.id;
      } catch {
        addToast({ message: `Failed to create scene for "${slot.row.name}"`, variant: "error" });
        return;
      }
    }

    try {
      await bulkImport.mutateAsync({ sceneId, file });
      addToast({ message: `Imported video for "${slot.row.name}"`, variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToast({ message: `Import failed: ${msg}`, variant: "error" });
    }
  }

  function handleDisableSlot(slot: SceneSlot) {
    toggleSetting.mutate({
      scene_type_id: slot.row.scene_type_id,
      track_id: slot.row.track_id ?? null,
      is_enabled: false,
    });
  }

  const isDisabled = importing || batchGenerate.isPending;

  return (
    <div
      className="space-y-[var(--spacing-4)]"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the container entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-[var(--spacing-3)]">
        {selectableCount > 0 && (
          <>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleSelectAll}
              label="Select all"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSelectMissing}
              disabled={isDisabled || missingSceneIds.length === 0}
            >
              Select Missing
            </Button>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-[var(--color-text-muted)]">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  onClick={handleBatchGenerate}
                  loading={batchGenerate.isPending}
                  disabled={isDisabled}
                  icon={<Play size={14} />}
                >
                  Generate Selected
                </Button>
              </>
            )}
          </>
        )}

        <div className="flex items-center gap-[var(--spacing-2)] ml-auto">
          <Button
            size="sm"
            variant={playback ? "primary" : "secondary"}
            onClick={() => setPlayback((v) => !v)}
            icon={playback ? <Pause size={14} /> : <Play size={14} />}
          >
            {playback ? "Stop Playback" : "Play Videos"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleGenerateAll}
            loading={batchGenerate.isPending || importing}
            disabled={isDisabled || !canGenerateAny}
            icon={<Play size={14} />}
          >
            Generate All
          </Button>
        </div>
      </div>

      {/* Drop zone overlay */}
      {dragOver && (
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)] p-8">
          <div className="flex items-center gap-[var(--spacing-2)] text-[var(--color-action-primary)]">
            <Upload size={24} />
            <span className="text-sm font-medium">Drop videos to import</span>
          </div>
        </div>
      )}

      {/* Importing indicator */}
      {importing && (
        <div className="flex items-center gap-[var(--spacing-2)] text-sm text-[var(--color-text-muted)]">
          <LoadingPane />
          <span>Importing videos...</span>
        </div>
      )}

      {/* Scene Grid */}
      <Grid cols={4} gap={4}>
        {slots.map((slot) => (
          <SceneCard
            key={`${slot.row.scene_type_id}-${slot.row.track_id ?? "none"}`}
            slot={slot}
            isSelected={slot.scene !== null && selected.has(slot.scene.id)}
            onToggleSelect={toggleSelectItem}
            onGenerate={handleSingleGenerate}
            onVideoDrop={handleSceneVideoDrop}
            onDisable={handleDisableSlot}
            generating={isDisabled}
            playback={playback}
          />
        ))}
      </Grid>

      {/* Import confirmation modal */}
      <ImportPreviewModal
        open={previewOpen}
        onClose={() => {
          // Ignore residual pointer events from the file drop that fire on
          // modal buttons before the user has a chance to interact.
          if (Date.now() - dropTimestampRef.current < 300) return;
          setPreviewOpen(false);
          setPendingImport(null);
        }}
        result={pendingImport}
        onConfirm={handleConfirmImport}
        importing={importing}
      />

      {/* Generate confirmation modal — warns about existing videos */}
      <GenerateConfirmModal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmCandidates([]);
        }}
        candidates={confirmCandidates}
        onConfirm={handleConfirmGenerate}
        loading={batchGenerate.isPending}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   SceneCard — renders a single slot (existing scene or placeholder)
   -------------------------------------------------------------------------- */

interface SceneCardProps {
  slot: SceneSlot;
  isSelected: boolean;
  onToggleSelect: (sceneId: number) => void;
  onGenerate: (sceneId: number) => void;
  onVideoDrop: (slot: SceneSlot, file: File) => void;
  onDisable: (slot: SceneSlot) => void;
  generating: boolean;
  playback: boolean;
}

function SceneCard({ slot, isSelected, onToggleSelect, onGenerate, onVideoDrop, onDisable, generating, playback }: SceneCardProps) {
  const { row, scene } = slot;
  const isPlaceholder = scene === null;
  const hasSeedImage = slot.missingVariant === null;
  const [dragOver, setDragOver] = useState(false);

  const estimated = scene?.total_segments_estimated ?? 0;
  const completed = scene?.total_segments_completed ?? 0;
  const pct = estimated > 0 ? Math.round((completed / estimated) * 100) : 0;
  const isGenerating = scene?.status_id === SCENE_STATUS_GENERATING;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        onVideoDrop(slot, file);
      }
    },
    [onVideoDrop, slot],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  return (
    <Card
      padding="none"
      className={cn(
        "group/card transition-colors overflow-hidden",
        isPlaceholder && !dragOver && "opacity-60 border-dashed",
        dragOver && "ring-2 ring-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]",
      )}
    >
      <div
        className="flex flex-col"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Video preview / drop target — with overlay checkbox */}
        <div className="relative">
          {dragOver ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-action-primary)] aspect-video">
              <Upload size={24} className="text-[var(--color-action-primary)]" />
              <span className="text-xs text-[var(--color-action-primary)] mt-1">Drop video here</span>
            </div>
          ) : (
            <SceneVideoThumbnail sceneId={scene?.id ?? 0} playback={playback} />
          )}

          {/* Checkbox overlay — top-left, visible on hover or when selected */}
          {scene && hasSeedImage && (
            <div
              className={cn(
                "absolute top-[var(--spacing-2)] left-[var(--spacing-2)] transition-opacity",
                isSelected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
              )}
            >
              <Checkbox checked={isSelected} onChange={() => onToggleSelect(scene.id)} />
            </div>
          )}

          {/* Disable button — top-right, visible on hover */}
          <button
            type="button"
            title="Disable this scene"
            className="absolute top-[var(--spacing-2)] right-[var(--spacing-2)] opacity-0 group-hover/card:opacity-100 transition-opacity p-1 rounded bg-black/60 hover:bg-black/80 text-white"
            onClick={() => onDisable(slot)}
          >
            <EyeOff size={14} />
          </button>

          {/* Missing seed image warning — overlays bottom of preview */}
          {slot.missingVariant && (
            <div className="absolute bottom-0 inset-x-0 flex items-center gap-[var(--spacing-1)] px-[var(--spacing-2)] py-[var(--spacing-1)] bg-[var(--color-action-danger)]/90 text-white text-xs">
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate">Missing seed image: {slot.missingVariant}</span>
            </div>
          )}
        </div>

        {/* Content below video */}
        <div className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
          {/* Header: title + track badge */}
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {row.name}
            </span>
            <span className="shrink-0 ml-auto inline-flex items-center gap-[var(--spacing-1)]">
              {row.track_slug && (
                <TrackBadge name={row.track_name ?? ""} slug={row.track_slug} />
              )}
              {row.has_clothes_off_transition && (
                <TrackBadge name="Clothes Off" slug="clothes_off" />
              )}
            </span>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Badge
              variant={isPlaceholder ? "default" : sceneStatusBadgeVariant(scene.status_id)}
              size="sm"
            >
              {isPlaceholder ? "Not Started" : sceneStatusLabel(scene.status_id)}
            </Badge>
            <span className="text-xs text-[var(--color-text-muted)]">
              Source: {sourceLabel(row.source)}
            </span>
          </div>

          {/* Segment progress */}
          {estimated > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-[var(--color-text-muted)]">
                Segments: {completed} / {estimated}
              </span>
              <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)]">
                <div
                  className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{pct}%</span>
            </div>
          )}

          {/* Generate button — disabled when no seed image */}
          <Button
            size="sm"
            variant="secondary"
            disabled={isPlaceholder || isGenerating || generating || !hasSeedImage}
            onClick={() => scene && onGenerate(scene.id)}
            icon={<Play size={14} />}
            className="w-full"
          >
            {isGenerating ? "Generating\u2026" : "Generate"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   SceneVideoThumbnail — shows the latest video version as a thumbnail
   -------------------------------------------------------------------------- */

function SceneVideoThumbnail({ sceneId, playback }: { sceneId: number; playback: boolean }) {
  const { data: versions } = useSceneVersions(sceneId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const hasVersions = !!versions && versions.length > 0;

  // Lazy-load: only start loading when the card scrolls into view.
  // Re-run when hasVersions changes so the observer attaches after the
  // early-return gate below stops blocking the ref-bearing div.
  useEffect(() => {
    if (!hasVersions) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasVersions]);

  if (!sceneId || !hasVersions) {
    return (
      <MediaPlaceholder
        icon={<Video size={24} className="text-[var(--color-text-muted)]" />}
        label="No video"
      />
    );
  }

  // Prefer the final version, otherwise the latest (highest version_number).
  const displayVersion =
    versions.find((v) => v.is_final) ??
    versions.reduce((a, b) => (a.version_number > b.version_number ? a : b));

  const streamUrl = getStreamUrl("version", displayVersion.id, "proxy");

  return (
    <div ref={containerRef} className="relative w-full rounded aspect-video bg-black overflow-hidden">
      {/* Spinner overlay — visible until the video has loaded */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-text-muted)] border-t-transparent" />
        </div>
      )}

      {/* Only mount the video element once the card is in the viewport */}
      {isVisible && (
        <video
          key={playback ? "play" : "thumb"}
          src={streamUrl}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          muted
          autoPlay={playback}
          loop={playback}
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}
