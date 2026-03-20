/**
 * Character scenes tab — grid of scene cards with generation controls (PRD-112).
 *
 * Shows a card for every enabled scene_type × track combination (derived from
 * the three-level merge: catalogue → project → character override, cross-joined
 * with catalogue tracks). Scenes that already exist display status, segment
 * progress, and a generate button. Scene types without a scene yet show a
 * placeholder card. Supports multi-select with batch generation, one-click
 * "Generate All", and drag-and-drop video import with filename matching.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/composite/useToast";
import { EmptyState } from "@/components/domain";
import { Grid } from "@/components/layout";
import { Button, LoadingPane, Toggle } from "@/components/primitives";
import { Checkbox } from "@/components/primitives/Checkbox";
import { useSetToggle } from "@/hooks/useSetToggle";
import { getStreamUrl } from "@/features/video-player";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Clock, EyeOff, MessageSquare, Pause, Play, Upload, Video } from "@/tokens/icons";
import { useGpuAvailability } from "@/app/footer";

import { Modal } from "@/components/composite/Modal";
import { useBatchGenerate, useRemoveScenesFromSchedule } from "@/features/generation/hooks/use-generation";
import { ScheduleGenerationModal } from "@/features/generation/ScheduleGenerationModal";
import { useSchedules } from "@/features/job-scheduling/hooks/use-job-scheduling";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { findVariantForTrack } from "@/features/images/utils";
import { sourceLabel } from "@/features/scene-catalogue/SourceBadge";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import {
  useCharacterSceneSettings,
  useToggleCharacterSceneSetting,
} from "@/features/scene-catalogue/hooks/use-character-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalogue/hooks/use-expanded-settings";
import { trackConfigKeys } from "@/features/scene-catalogue/hooks/use-track-configs";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import type { ExpandedSceneSetting, SceneTypeTrackConfig } from "@/features/scene-catalogue/types";
import { CharacterSceneOverrideEditor } from "@/features/prompt-management/CharacterSceneOverrideEditor";
import { ClipGallery } from "@/features/scenes/ClipGallery";
import { useCharacterScenes, useCreateScene } from "@/features/scenes/hooks/useCharacterScenes";
import { clipKeys, useBulkImportClip } from "@/features/scenes/hooks/useClipManagement";
import {
  SCENE_STATUS_APPROVED,
  SCENE_STATUS_FAILED,
  SCENE_STATUS_GENERATING,
  SCENE_STATUS_REJECTED,
  SCENE_STATUS_SCHEDULED,
  sceneHasVideo,
  sceneStatusLabel,
} from "@/features/scenes/types";
import type { Scene } from "@/features/scenes/types";

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
  /** When set, auto-open the detail modal for this scene on mount. */
  focusSceneId?: number;
  /** When set (with focusTrackId), auto-open the detail modal for this scene_type+track on mount. */
  focusSceneTypeId?: number;
  /** Track ID to match when using focusSceneTypeId. */
  focusTrackId?: number;
  /** Whether the character is enabled. When false, all generation controls are disabled. */
  characterEnabled?: boolean;
}

export function CharacterScenesTab({ characterId, focusSceneId, focusSceneTypeId, focusTrackId, characterEnabled = true }: CharacterScenesTabProps) {
  const queryClient = useQueryClient();
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useCharacterSceneSettings(characterId);
  const allExpandedRows = useExpandedSettings(settings);
  const { hasActiveGpu } = useGpuAvailability();

  // Track which scenes are generating so we can poll and detect transitions.
  const [anyGenerating, setAnyGenerating] = useState(false);
  const prevGeneratingRef = useRef<Set<number>>(new Set());
  const { data: scenes, isLoading: scenesLoading } = useCharacterScenes(characterId, anyGenerating);

  // When a scene transitions from generating → not generating, refresh its clips.
  useEffect(() => {
    if (!scenes) return;
    const currentGenerating = new Set(
      scenes.filter((s) => s.status_id === SCENE_STATUS_GENERATING).map((s) => s.id),
    );
    const prev = prevGeneratingRef.current;
    for (const sceneId of prev) {
      if (!currentGenerating.has(sceneId)) {
        // This scene just finished generating — refresh its clips.
        queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      }
    }
    prevGeneratingRef.current = currentGenerating;
    setAnyGenerating(currentGenerating.size > 0);
  }, [scenes, queryClient]);

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

  /* --- hide scenes without videos --- */
  const [hideEmpty, setHideEmpty] = useState(false);

  /* --- clip gallery (scene detail) modal state --- */
  const [detailSlotIndex, setDetailSlotIndex] = useState<number | null>(null);
  const [promptOverrideOpen, setPromptOverrideOpen] = useState(false);

  /* --- schedule generation state (PRD-134) --- */
  const [scheduleSceneIds, setScheduleSceneIds] = useState<number[]>([]);
  const [cancelScheduleSceneId, setCancelScheduleSceneId] = useState<number | null>(null);
  const { data: activeSchedules } = useSchedules({ is_active: "true" });
  const removeFromSchedule = useRemoveScenesFromSchedule();

  // Build a lookup: sceneId → scheduleId for scheduled scenes.
  const sceneScheduleMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of activeSchedules ?? []) {
      if (s.action_type !== "schedule_generation" || !s.is_active) continue;
      const ids = s.action_config?.scene_ids;
      if (Array.isArray(ids)) {
        for (const id of ids) map.set(id as number, s.id);
      }
    }
    return map;
  }, [activeSchedules]);

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

  /** Slots that have an existing scene (navigable in the detail modal). */
  const navigableSlots = useMemo(
    () => slots.filter((s) => s.scene !== null),
    [slots],
  );

  /* --- auto-open detail modal when focusSceneId or focusSceneTypeId is provided --- */
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (focusAppliedRef.current) return;
    if (navigableSlots.length === 0) return;

    let idx = -1;
    if (focusSceneId != null) {
      idx = navigableSlots.findIndex((s) => s.scene?.id === focusSceneId);
    } else if (focusSceneTypeId != null) {
      idx = navigableSlots.findIndex(
        (s) => s.row.scene_type_id === focusSceneTypeId && (s.row.track_id ?? null) === (focusTrackId ?? null),
      );
    }

    if (idx >= 0) {
      setDetailSlotIndex(idx);
      focusAppliedRef.current = true;
    }
  }, [focusSceneId, focusSceneTypeId, focusTrackId, navigableSlots]);

  const detailScene = detailSlotIndex !== null ? navigableSlots[detailSlotIndex] ?? null : null;

  /* --- workflow lookup: fetch track configs for all unique scene types --- */
  const uniqueSceneTypeIds = useMemo(
    () => [...new Set(expandedRows.map((r) => r.scene_type_id))],
    [expandedRows],
  );

  const trackConfigResults = useQueries({
    queries: uniqueSceneTypeIds.map((stId) => ({
      queryKey: trackConfigKeys.list(stId),
      queryFn: () => api.get<SceneTypeTrackConfig[]>(`/scene-types/${stId}/track-configs`),
      staleTime: 5 * 60 * 1000,
    })),
  });

  /** Map from "sceneTypeId::trackId" to whether a workflow is assigned. */
  const workflowMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const result of trackConfigResults) {
      if (!result.data) continue;
      for (const cfg of result.data) {
        map.set(`${cfg.scene_type_id}::${cfg.track_id}`, cfg.workflow_id != null);
      }
    }
    return map;
  }, [trackConfigResults]);

  /** Map from "sceneTypeId::trackId" to the assigned workflow_id (or null). */
  const workflowIdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const result of trackConfigResults) {
      if (!result.data) continue;
      for (const cfg of result.data) {
        if (cfg.workflow_id != null) {
          map.set(`${cfg.scene_type_id}::${cfg.track_id}`, cfg.workflow_id);
        }
      }
    }
    return map;
  }, [trackConfigResults]);

  /* --- selectable scene IDs: only scenes with a seed image can be selected for generation --- */
  const selectableSceneIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of slots) {
      if (s.scene !== null && s.missingVariant === null) ids.add(s.scene.id);
    }
    return [...ids];
  }, [slots]);

  /** Set of scene IDs that have at least one video version (from scene list response). */
  const scenesWithVideo = useMemo(() => {
    const set = new Set<number>();
    for (const slot of slots) {
      if (slot.scene && slot.scene.version_count > 0) set.add(slot.scene.id);
    }
    return set;
  }, [slots]);

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

  function handleScheduleScenes(sceneIds: number[]) {
    setScheduleSceneIds(sceneIds);
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

  const isDisabled = !characterEnabled || importing || batchGenerate.isPending;

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
                <div className="flex">
                  <Button
                    size="sm"
                    onClick={handleBatchGenerate}
                    loading={batchGenerate.isPending}
                    disabled={isDisabled}
                    icon={<Play size={14} />}
                    className="!rounded-r-none"
                  >
                    Generate Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleScheduleScenes([...selected])}
                    icon={<Clock size={14} />}
                    className="shrink-0 !rounded-l-none !border-l-0"
                    aria-label="Schedule selected"
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="flex items-center gap-[var(--spacing-2)] ml-auto">
          <Toggle
            checked={hideEmpty}
            onChange={setHideEmpty}
            label="Has video"
            size="sm"
          />
          <Button
            size="sm"
            variant={playback ? "primary" : "secondary"}
            onClick={() => setPlayback((v) => !v)}
            icon={playback ? <Pause size={14} /> : <Play size={14} />}
          >
            {playback ? "Stop Playback" : "Play Videos"}
          </Button>
          <div className="flex">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerateAll}
              loading={batchGenerate.isPending || importing}
              disabled={isDisabled || !canGenerateAny}
              icon={<Play size={14} />}
              className="!rounded-r-none"
            >
              Generate All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleScheduleScenes(selectableSceneIds)}
              disabled={isDisabled || !canGenerateAny || selectableSceneIds.length === 0}
              icon={<Clock size={14} />}
              className="shrink-0 !rounded-l-none !border-l-0"
              aria-label="Schedule all"
            />
          </div>
        </div>
      </div>

      {/* Drop zone overlay */}
      {dragOver && (
        <div className="flex items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-action-primary)] bg-[#0d1117] p-8">
          <div className="flex items-center gap-[var(--spacing-2)] text-[var(--color-action-primary)] font-mono text-sm">
            <Upload size={24} />
            <span>Drop videos to import</span>
          </div>
        </div>
      )}

      {/* Importing indicator */}
      {importing && (
        <div className="flex items-center gap-[var(--spacing-2)] text-xs font-mono text-[var(--color-text-muted)]">
          <LoadingPane />
          <span>Importing videos...</span>
        </div>
      )}

      {/* Scene Grid */}
      <Grid cols={2} gap={4} className="sm:grid-cols-3 lg:grid-cols-4 min-[1500px]:grid-cols-5 min-[1700px]:grid-cols-6">
        {slots.filter((slot) => !hideEmpty || (slot.scene && slot.scene.version_count > 0)).map((slot) => (
          <SceneCard
            key={`${slot.row.scene_type_id}-${slot.row.track_id ?? "none"}`}
            slot={slot}
            isSelected={slot.scene !== null && selected.has(slot.scene.id)}
            onToggleSelect={toggleSelectItem}
            onGenerate={handleSingleGenerate}
            onSchedule={(sceneId) => handleScheduleScenes([sceneId])}
            onCancelSchedule={(sceneId) => setCancelScheduleSceneId(sceneId)}
            isScheduled={slot.scene !== null && sceneScheduleMap.has(slot.scene.id)}
            onClickScene={(sceneId) => {
              const idx = navigableSlots.findIndex((s) => s.scene?.id === sceneId);
              if (idx >= 0) setDetailSlotIndex(idx);
            }}
            onVideoDrop={handleSceneVideoDrop}
            onDisable={handleDisableSlot}
            generating={isDisabled}
            playback={playback}
            hasWorkflow={workflowMap.get(`${slot.row.scene_type_id}::${slot.row.track_id}`) ?? false}
            hasActiveGpu={hasActiveGpu}
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

      {/* Scene detail (clip gallery) modal */}
      <Modal
        open={detailSlotIndex !== null}
        onClose={() => setDetailSlotIndex(null)}
        size="3xl"
      >
        {detailScene && detailScene.scene && (
          <div className="flex flex-col gap-[var(--spacing-4)]">
            {/* Header with navigation + track badge */}
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Button
                size="sm"
                variant="ghost"
                disabled={detailSlotIndex === 0}
                onClick={() => setDetailSlotIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                icon={<ChevronLeft size={16} />}
                aria-label="Previous scene"
              />
              <h2 className="text-sm font-semibold font-mono uppercase tracking-wide text-[var(--color-text-primary)]">
                {detailScene.row.name}
              </h2>
              {detailScene.row.track_slug && (
                <span className={`text-xs font-mono font-medium ${TRACK_TEXT_COLORS[detailScene.row.track_slug] ?? "text-[var(--color-text-primary)]"}`}>
                  {detailScene.row.track_name}
                </span>
              )}
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                {(detailSlotIndex ?? 0) + 1}/{navigableSlots.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={detailSlotIndex === navigableSlots.length - 1}
                onClick={() => setDetailSlotIndex((i) => (i !== null && i < navigableSlots.length - 1 ? i + 1 : i))}
                icon={<ChevronRight size={16} />}
                aria-label="Next scene"
              />
            </div>
            <ClipGallery
              sceneId={detailScene.scene.id}
              onGenerate={() => handleSingleGenerate(detailScene.scene!.id)}
              generateLoading={batchGenerate.isPending}
              leftActions={
                <div className="flex items-center gap-2">
                  {workflowIdMap.get(`${detailScene.row.scene_type_id}::${detailScene.row.track_id}`) != null && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<MessageSquare size={14} />}
                      onClick={() => setPromptOverrideOpen(true)}
                    >
                      Prompt Overrides
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Clock size={14} />}
                    onClick={() => handleScheduleScenes([detailScene.scene!.id])}
                  >
                    Schedule
                  </Button>
                </div>
              }
              generateDisabled={
                isDisabled
                || detailScene.missingVariant !== null
                || !(workflowMap.get(`${detailScene.row.scene_type_id}::${detailScene.row.track_id}`) ?? false)
              }
              generateDisabledReason={
                !(workflowMap.get(`${detailScene.row.scene_type_id}::${detailScene.row.track_id}`) ?? false)
                  ? "No workflow assigned to this scene type / track"
                  : detailScene.missingVariant !== null
                    ? "No seed image set"
                    : undefined
              }
              isGenerating={detailScene.scene.status_id === SCENE_STATUS_GENERATING}
            />
          </div>
        )}
      </Modal>

      {/* Prompt override modal */}
      {detailScene && detailScene.scene && (() => {
        const wfId = workflowIdMap.get(`${detailScene.row.scene_type_id}::${detailScene.row.track_id}`);
        return wfId != null ? (
          <Modal
            title={`Prompt Overrides — ${detailScene.row.name}`}
            open={promptOverrideOpen}
            onClose={() => setPromptOverrideOpen(false)}
            size="3xl"
          >
            <CharacterSceneOverrideEditor
              characterId={characterId}
              sceneTypeId={detailScene.row.scene_type_id}
              workflowId={wfId}
            />
          </Modal>
        ) : null;
      })()}

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

      {/* Schedule generation modal (PRD-134) */}
      <ScheduleGenerationModal
        sceneIds={scheduleSceneIds}
        onClose={() => setScheduleSceneIds([])}
        onScheduled={() => setScheduleSceneIds([])}
      />

      {/* Manage scheduled generation modal (PRD-134) */}
      {(() => {
        if (cancelScheduleSceneId === null) return null;
        const scheduleId = sceneScheduleMap.get(cancelScheduleSceneId);
        const schedule = (activeSchedules ?? []).find((s) => s.id === scheduleId);
        const firesAt = schedule?.next_run_at ?? schedule?.scheduled_at;
        const groupSize = Array.isArray(schedule?.action_config?.scene_ids)
          ? (schedule.action_config.scene_ids as number[]).length
          : 0;

        return (
          <Modal
            open
            onClose={() => setCancelScheduleSceneId(null)}
            title="Scheduled Generation"
            size="sm"
          >
            <div className="flex flex-col gap-[var(--spacing-4)]">
              <div className="text-xs font-mono text-[var(--color-text-secondary)] space-y-1">
                <p>
                  Scheduled for{" "}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {firesAt
                      ? new Date(firesAt).toLocaleString(undefined, {
                          weekday: "short", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })
                      : "unknown time"}
                  </span>
                </p>
                {groupSize > 1 && (
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">
                    Part of a group of {groupSize} scenes. Rescheduling will move only this scene to a new time.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
                <Button variant="secondary" size="sm" onClick={() => setCancelScheduleSceneId(null)}>
                  Close
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Clock size={14} />}
                  onClick={() => {
                    setCancelScheduleSceneId(null);
                    setScheduleSceneIds([cancelScheduleSceneId]);
                  }}
                >
                  Reschedule
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={removeFromSchedule.isPending}
                  onClick={() => {
                    if (!scheduleId) return;
                    removeFromSchedule.mutate(
                      { scheduleId, sceneIds: [cancelScheduleSceneId] },
                      {
                        onSuccess: () => {
                          addToast({ message: "Scene removed from schedule", variant: "info" });
                          setCancelScheduleSceneId(null);
                        },
                      },
                    );
                  }}
                >
                  Cancel Schedule
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
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
  onSchedule: (sceneId: number) => void;
  onCancelSchedule: (sceneId: number) => void;
  isScheduled: boolean;
  onClickScene: (sceneId: number, name: string, trackName: string | null, trackSlug: string | null) => void;
  onVideoDrop: (slot: SceneSlot, file: File) => void;
  onDisable: (slot: SceneSlot) => void;
  generating: boolean;
  playback: boolean;
  hasWorkflow: boolean;
  hasActiveGpu: boolean;
}

function SceneCard({ slot, isSelected, onToggleSelect, onGenerate, onSchedule, onCancelSchedule, isScheduled, onClickScene, onVideoDrop, onDisable, generating, playback, hasWorkflow, hasActiveGpu }: SceneCardProps) {
  const { row, scene } = slot;
  const isPlaceholder = scene === null;
  const hasSeedImage = slot.missingVariant === null;
  const [dragOver, setDragOver] = useState(false);

  const estimated = scene?.total_segments_estimated ?? 0;
  const completed = scene?.total_segments_completed ?? 0;
  const pct = estimated > 0 ? Math.round((completed / estimated) * 100) : 0;
  const isGenerating = scene?.status_id === SCENE_STATUS_GENERATING;
  const isApproved = scene?.status_id === SCENE_STATUS_APPROVED;
  const isRejected = scene?.status_id === SCENE_STATUS_REJECTED;
  const isFailed = scene?.status_id === SCENE_STATUS_FAILED;

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
    <div
      className={cn(
        "group/card rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden transition-colors",
        !isPlaceholder && "cursor-pointer",
        isPlaceholder && !dragOver && "opacity-60 border-dashed",
        dragOver && "ring-2 ring-[var(--color-action-primary)]",
        isApproved && "!border-2 !border-green-500",
        isRejected && "!border-2 !border-red-500",
        isFailed && "!border-2 !border-red-500",
      )}
    >
      <div
        className="flex flex-col"
        onClick={() => {
          if (scene) onClickScene(scene.id, row.name, row.track_name ?? null, row.track_slug ?? null);
        }}
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
            <SceneVideoThumbnail versionId={scene?.latest_version_id ?? null} playback={playback} />
          )}

          {/* Checkbox overlay — top-left, visible on hover or when selected */}
          {scene && hasSeedImage && (
            <div
              className={cn(
                "absolute top-[var(--spacing-2)] left-[var(--spacing-2)] transition-opacity",
                isSelected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
              )}
            >
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onChange={() => onToggleSelect(scene.id)} />
              </div>
            </div>
          )}

          {/* Disable button — top-right, visible on hover */}
          <button
            type="button"
            title="Disable this scene"
            className="absolute top-[var(--spacing-2)] right-[var(--spacing-2)] opacity-0 group-hover/card:opacity-100 transition-opacity p-1 rounded bg-black/60 hover:bg-black/80 text-white"
            onClick={(e) => { e.stopPropagation(); onDisable(slot); }}
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

          {/* Newer-than-final indicator — bottom-right blue dot */}
          {scene?.has_newer_than_final && (
            <div
              className="absolute bottom-[var(--spacing-2)] right-[var(--spacing-2)] h-3 w-3 rounded-full bg-[var(--color-action-primary)] ring-2 ring-[var(--color-surface-primary)]"
              title="Newer clips exist after the final version"
            />
          )}

          {/* Segment progress overlay — bottom of video thumbnail */}
          {isGenerating && estimated > 0 && (
            <div className="absolute bottom-0 inset-x-0 bg-black/60 px-[var(--spacing-2)] py-[var(--spacing-1)]">
              <div className="flex items-center justify-between text-[10px] text-white mb-0.5">
                <span>{completed} / {estimated} segments</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content below video */}
        <div className="flex flex-col gap-1.5 px-[var(--spacing-2)] py-[var(--spacing-2)]">
          {/* Header: title + track badge */}
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono truncate">
              {row.name}
            </span>
            <span className="shrink-0 ml-auto inline-flex items-center gap-1 font-mono text-[10px]">
              {row.track_slug && (
                <span className={TRACK_TEXT_COLORS[row.track_slug] ?? "text-[var(--color-text-primary)]"}>{row.track_name}</span>
              )}
              {row.has_clothes_off_transition && (
                <span className="text-orange-400">clothes off</span>
              )}
            </span>
          </div>

          {/* Status row — terminal style */}
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className={
              isPlaceholder ? "text-[var(--color-text-muted)]"
              : isApproved ? "text-green-400"
              : isGenerating ? "text-cyan-400"
              : isFailed || isRejected ? "text-red-400"
              : "text-cyan-400"
            }>
              {isPlaceholder ? "not started" : (isGenerating && !hasActiveGpu) ? "queued" : sceneStatusLabel(scene.status_id).toLowerCase()}
            </span>
            {isGenerating && !hasActiveGpu && (
              <span className="flex items-center gap-0.5 text-orange-400" title="No GPU instances are active — job is queued">
                <AlertTriangle size={10} /> no gpu
              </span>
            )}
            <span className="opacity-30">|</span>
            <span>{sourceLabel(row.source).toLowerCase()}</span>
          </div>

          {/* Generate + Schedule button group — xs size */}
          <div
            className="flex w-full"
            title={
              !hasWorkflow ? "No workflow assigned to this scene type / track"
              : !hasSeedImage ? "No seed image set"
              : undefined
            }
          >
            <Button
              size="xs"
              variant={isFailed ? "danger" : "secondary"}
              disabled={isPlaceholder || isGenerating || generating || !hasSeedImage || !hasWorkflow}
              onClick={(e) => { e.stopPropagation(); scene && onGenerate(scene.id); }}
              icon={<Play size={12} />}
              className="flex-1 !rounded-r-none"
            >
              {isGenerating
                ? (hasActiveGpu ? "Generating\u2026" : "Queued")
                : scene?.status_id === SCENE_STATUS_SCHEDULED ? "Scheduled"
                : isFailed ? "Retry" : "Generate"}
            </Button>
            <Button
              size="xs"
              variant={isScheduled ? "danger" : "secondary"}
              disabled={isPlaceholder || isGenerating || generating || (!isScheduled && (!hasSeedImage || !hasWorkflow))}
              onClick={(e) => {
                e.stopPropagation();
                if (!scene) return;
                if (isScheduled) onCancelSchedule(scene.id);
                else onSchedule(scene.id);
              }}
              icon={<Clock size={12} />}
              className="shrink-0 !rounded-l-none !border-l-0"
              aria-label={isScheduled ? "Cancel scheduled generation" : "Schedule generation"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   SceneVideoThumbnail — shows the latest video version as a thumbnail
   -------------------------------------------------------------------------- */

function SceneVideoThumbnail({ versionId, playback }: { versionId: number | null; playback: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Lazy-load: only start loading when the card scrolls into view.
  useEffect(() => {
    if (!versionId) return;
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
  }, [versionId]);

  if (!versionId) {
    return (
      <MediaPlaceholder
        icon={<Video size={24} className="text-[var(--color-text-muted)]" />}
        label="No video"
      />
    );
  }

  const streamUrl = getStreamUrl("version", versionId, "proxy");

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
