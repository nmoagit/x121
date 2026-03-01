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

import { Card } from "@/components/composite/Card";
import { useToast } from "@/components/composite/useToast";
import { EmptyState } from "@/components/domain";
import { Grid } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { Checkbox } from "@/components/primitives/Checkbox";
import { API_BASE_URL } from "@/lib/api";
import { AlertCircle, Pause, Play, Upload, Video } from "@/tokens/icons";

import { useBatchGenerate } from "@/features/generation/hooks/use-generation";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { sourceLabel } from "@/features/scene-catalog/SourceBadge";
import { TrackBadge } from "@/features/scene-catalog/TrackBadge";
import { useCharacterSceneSettings } from "@/features/scene-catalog/hooks/use-character-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalog/hooks/use-expanded-settings";
import { useTracks } from "@/features/scene-catalog/hooks/use-tracks";
import type { ExpandedSceneSetting } from "@/features/scene-catalog/types";
import { useCharacterScenes, useCreateScene } from "@/features/scenes/hooks/useCharacterScenes";
import { useBulkImportClip, useSceneVersions } from "@/features/scenes/hooks/useClipManagement";
import {
  SCENE_STATUS_GENERATING,
  sceneStatusBadgeVariant,
  sceneStatusLabel,
} from "@/features/scenes/types";
import type { Scene } from "@/features/scenes/types";

import { ImportPreviewModal } from "./ImportPreviewModal";
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
  const { expandedRows: allExpandedRows, catalogLoading } = useExpandedSettings(settings);
  const { data: scenes, isLoading: scenesLoading } = useCharacterScenes(characterId);
  const { data: tracks } = useTracks();
  const { data: imageVariants } = useImageVariants(characterId);
  const batchGenerate = useBatchGenerate();
  const createScene = useCreateScene(characterId);
  const bulkImport = useBulkImportClip();
  const { addToast } = useToast();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<MatchResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [playback, setPlayback] = useState(true);
  /** Timestamp of last drop — used to ignore residual pointer events that close the modal. */
  const dropTimestampRef = useRef(0);

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
    (trackSlug: string | undefined): number | null => {
      if (!imageVariants || imageVariants.length === 0) return null;
      if (trackSlug) {
        const match = imageVariants.find(
          (v) => v.variant_type?.toLowerCase() === trackSlug.toLowerCase() && v.is_hero,
        );
        if (match) return match.id;
        // Fallback: any variant matching the track type
        const fallback = imageVariants.find(
          (v) => v.variant_type?.toLowerCase() === trackSlug.toLowerCase(),
        );
        if (fallback) return fallback.id;
        // No variant matches this track — don't fall through to a generic one
        return null;
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

  /* --- can any slot actually generate? (must have seed image) --- */
  const canGenerateAny = useMemo(
    () => slots.some((s) => s.missingVariant === null),
    [slots],
  );

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

  if (settingsLoading || catalogLoading || scenesLoading) {
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

  function toggleSelect(sceneId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableSceneIds));
    }
  }

  function handleBatchGenerate() {
    if (selected.size === 0) return;
    batchGenerate.mutate({ scene_ids: [...selected] });
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

    batchGenerate.mutate({ scene_ids: sceneIds });
  }

  function handleSingleGenerate(sceneId: number) {
    batchGenerate.mutate({ scene_ids: [sceneId] });
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
            onToggleSelect={toggleSelect}
            onGenerate={handleSingleGenerate}
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
  generating: boolean;
  playback: boolean;
}

function SceneCard({ slot, isSelected, onToggleSelect, onGenerate, generating, playback }: SceneCardProps) {
  const { row, scene } = slot;
  const isPlaceholder = scene === null;
  const hasSeedImage = slot.missingVariant === null;

  const estimated = scene?.total_segments_estimated ?? 0;
  const completed = scene?.total_segments_completed ?? 0;
  const pct = estimated > 0 ? Math.round((completed / estimated) * 100) : 0;
  const isGenerating = scene?.status_id === SCENE_STATUS_GENERATING;

  return (
    <Card padding="md" className={isPlaceholder ? "opacity-60 border-dashed" : undefined}>
      <div className="flex flex-col gap-[var(--spacing-3)]">
        {/* Header: checkbox + title + track badge */}
        <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
          {scene && hasSeedImage && (
            <Checkbox checked={isSelected} onChange={() => onToggleSelect(scene.id)} />
          )}
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {row.name}
          </span>
          {row.track_slug && (
            <span className="shrink-0 ml-auto">
              <TrackBadge name={row.track_name ?? ""} slug={row.track_slug} />
            </span>
          )}
        </div>

        {/* Video preview — always rendered for fixed layout */}
        <SceneVideoThumbnail sceneId={scene?.id ?? 0} playback={playback} />

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

        {/* Segment progress — fixed height so cards don't shift */}
        <div className="space-y-1 h-[3rem]">
          {estimated > 0 ? (
            <>
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
            </>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">No segments yet</span>
          )}
        </div>

        {/* Missing seed image warning — fixed height so layout stays stable */}
        <div className="h-5">
          {slot.missingVariant && (
            <div className="flex items-center gap-[var(--spacing-1)] text-xs text-[var(--color-action-danger)]">
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate">Missing seed image: {slot.missingVariant}</span>
            </div>
          )}
        </div>

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
    </Card>
  );
}

/* --------------------------------------------------------------------------
   SceneVideoThumbnail — shows the latest video version as a thumbnail
   -------------------------------------------------------------------------- */

function SceneVideoThumbnail({ sceneId, playback }: { sceneId: number; playback: boolean }) {
  const { data: versions } = useSceneVersions(sceneId);

  if (!sceneId || !versions || versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded bg-[var(--color-surface-tertiary)] aspect-video">
        <Video size={24} className="text-[var(--color-text-muted)]" />
        <span className="text-xs text-[var(--color-text-muted)] mt-1">No video</span>
      </div>
    );
  }

  // Prefer the final version, otherwise the latest (highest version_number).
  const displayVersion =
    versions.find((v) => v.is_final) ??
    versions.reduce((a, b) => (a.version_number > b.version_number ? a : b));

  const streamUrl = `${API_BASE_URL}/videos/version/${displayVersion.id}/stream`;

  return (
    <video
      key={playback ? "play" : "thumb"}
      src={streamUrl}
      className="w-full rounded aspect-video object-cover bg-black"
      muted
      autoPlay={playback}
      loop={playback}
      preload="metadata"
    />
  );
}
