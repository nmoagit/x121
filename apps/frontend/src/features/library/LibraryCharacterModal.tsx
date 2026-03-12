/**
 * Modal for previewing a library character's assets.
 *
 * Shows seed/track images, scene videos with a final version, and metadata JSON.
 * Each item is clickable to view full-size image, play video, or inspect JSON.
 */

import { useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";

import { Modal } from "@/components/composite";
import { Badge, Button, ProgressiveImage, Spinner } from "@/components/primitives";
import { useCharacterMetadata } from "@/features/characters/hooks/use-character-detail";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { variantThumbnailUrl, variantImageUrl } from "@/features/images/utils";
import { useSceneCatalogue } from "@/features/scene-catalogue/hooks/use-scene-catalogue";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useCharacterScenes } from "@/features/scenes/hooks/useCharacterScenes";
import { sceneHasVideo } from "@/features/scenes/types";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { getStreamUrl } from "@/features/video-player/hooks/use-video-metadata";
import { cn } from "@/lib/cn";
import { ArrowRight, Film, FileText, Image, Play, X } from "@/tokens/icons";

import type { LibraryCharacter } from "./types";

/* --------------------------------------------------------------------------
   Sub-views for detail panels
   -------------------------------------------------------------------------- */

type DetailView =
  | { kind: "image"; url: string; label: string }
  | { kind: "video"; versionId: number; label: string }
  | { kind: "json"; data: Record<string, unknown> };

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LibraryCharacterModalProps {
  character: LibraryCharacter;
  open: boolean;
  onClose: () => void;
}

export function LibraryCharacterModal({
  character,
  open,
  onClose,
}: LibraryCharacterModalProps) {
  const [detail, setDetail] = useState<DetailView | null>(null);

  // Fetch character assets
  const { data: variants, isLoading: loadingImages } = useImageVariants(character.id);
  const { data: scenes, isLoading: loadingScenes } = useCharacterScenes(character.id);
  const { data: metadata, isLoading: loadingMeta } = useCharacterMetadata(character.id);

  // Fetch scene types and tracks for name resolution
  const { data: sceneCatalogue } = useSceneCatalogue();
  const { data: tracks } = useTracks();

  // Build ID→name lookup maps
  const sceneTypeMap = useMemo(() => {
    const map = new Map<number, { name: string; hasClothesOff: boolean }>();
    if (!sceneCatalogue) return map;
    for (const st of sceneCatalogue) {
      map.set(st.id, { name: st.name, hasClothesOff: st.has_clothes_off_transition });
    }
    return map;
  }, [sceneCatalogue]);

  const trackMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!tracks) return map;
    for (const t of tracks) {
      map.set(t.id, t.name);
    }
    return map;
  }, [tracks]);

  // Seed/track images — pick hero or first variant per variant_type
  const seedImages = useMemo(() => {
    if (!variants) return [];
    const byType = new Map<string, typeof variants[number]>();
    for (const v of variants) {
      if (!v.file_path) continue;
      const key = v.variant_type?.toLowerCase() ?? "default";
      const existing = byType.get(key);
      if (!existing || v.is_hero || (v.status_id === 2 && existing.status_id !== 2)) {
        byType.set(key, v);
      }
    }
    return Array.from(byType.values());
  }, [variants]);

  // Scenes with a final video (latest_version_id set and status >= generated)
  const scenesWithVideo = useMemo(() => {
    if (!scenes) return [];
    return scenes.filter((s) => sceneHasVideo(s) && s.latest_version_id != null);
  }, [scenes]);

  /** Build display label for a scene: "SceneType — Track" or "SceneType — Clothes-off" */
  const sceneLabel = (scene: { scene_type_id: number; track_id: number | null }) => {
    const st = sceneTypeMap.get(scene.scene_type_id);
    const sceneTypeName = st?.name ?? `Type ${scene.scene_type_id}`;
    if (st?.hasClothesOff && scene.track_id == null) {
      return `${sceneTypeName} \u2014 Clothes-off`;
    }
    if (scene.track_id != null) {
      const trackName = trackMap.get(scene.track_id) ?? `Track ${scene.track_id}`;
      return `${sceneTypeName} \u2014 ${trackName}`;
    }
    return sceneTypeName;
  };

  const hasMetadata = metadata && Object.keys(metadata).length > 0;
  const isLoading = loadingImages || loadingScenes || loadingMeta;

  return (
    <Modal open={open} onClose={onClose} title={character.name} size="3xl">
      <div className="flex flex-col gap-4 min-h-[400px]">
        {/* Header info + Go To Character */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-text-muted)]">
            {character.project_name}
            {character.group_name && ` / ${character.group_name}`}
          </p>
          <Link
            to="/projects/$projectId/characters/$characterId"
            params={{
              projectId: String(character.project_id),
              characterId: String(character.id),
            }}
            search={{ tab: undefined, scene: undefined }}
          >
            <Button variant="secondary" size="sm">
              Go to Character
              <ArrowRight size={14} aria-hidden className="ml-1" />
            </Button>
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        )}

        {!isLoading && (
          <div className="flex flex-col gap-6">
            {/* Seed / Track Images */}
            {seedImages.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                  <Image size={16} aria-hidden />
                  Seed Images
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {seedImages.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setDetail({
                          kind: "image",
                          url: variantImageUrl(v.file_path),
                          label: v.variant_label || v.variant_type || "Image",
                        })
                      }
                      className={cn(
                        "relative aspect-square rounded-[var(--radius-md)] overflow-hidden",
                        "bg-[var(--color-surface-tertiary)] cursor-pointer",
                        "ring-1 ring-[var(--color-border-default)]",
                        "hover:ring-[var(--color-border-accent)] transition-all",
                      )}
                    >
                      <ProgressiveImage
                        lowSrc={variantThumbnailUrl(v.id, 128)}
                        highSrc={variantThumbnailUrl(v.id, 1024)}
                        alt={v.variant_label || v.variant_type || "Seed image"}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                        {v.variant_type || v.variant_label || "Image"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Scene Videos */}
            {scenesWithVideo.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                  <Film size={16} aria-hidden />
                  Scene Videos
                  <Badge variant="default" size="sm">{scenesWithVideo.length}</Badge>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {scenesWithVideo.map((s) => {
                    const label = sceneLabel(s);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setDetail({
                            kind: "video",
                            versionId: s.latest_version_id!,
                            label,
                          })
                        }
                        className={cn(
                          "group/play relative aspect-video rounded-[var(--radius-md)] overflow-hidden",
                          "bg-[var(--color-surface-tertiary)] cursor-pointer",
                          "ring-1 ring-[var(--color-border-default)]",
                          "hover:ring-[var(--color-border-accent)] transition-all",
                        )}
                      >
                        <video
                          src={getStreamUrl("version", s.latest_version_id!, "proxy")}
                          className="absolute inset-0 w-full h-full object-cover"
                          preload="metadata"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                        {/* Play icon overlay on hover */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
                          <Play size={24} className="text-white" />
                        </div>
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Metadata JSON */}
            {hasMetadata && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                  <FileText size={16} aria-hidden />
                  Metadata
                </h3>
                <button
                  type="button"
                  onClick={() => setDetail({ kind: "json", data: metadata })}
                  className={cn(
                    "w-full text-left p-3 rounded-[var(--radius-md)]",
                    "bg-[var(--color-surface-tertiary)] cursor-pointer",
                    "ring-1 ring-[var(--color-border-default)]",
                    "hover:ring-[var(--color-border-accent)] transition-all",
                    "text-xs text-[var(--color-text-muted)] font-mono",
                    "line-clamp-4 overflow-hidden",
                  )}
                >
                  {JSON.stringify(metadata, null, 2).slice(0, 300)}
                  {JSON.stringify(metadata, null, 2).length > 300 && "..."}
                </button>
              </section>
            )}

            {/* Empty state */}
            {seedImages.length === 0 && scenesWithVideo.length === 0 && !hasMetadata && (
              <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
                No assets found for this character.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail overlay */}
      {detail && (
        <DetailOverlay detail={detail} onClose={() => setDetail(null)} />
      )}
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Detail overlay — shows image, video, or JSON in a floating panel
   -------------------------------------------------------------------------- */

function DetailOverlay({
  detail,
  onClose,
}: {
  detail: DetailView;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={cn(
          "relative max-w-4xl max-h-[90vh] w-full mx-4",
          "bg-[var(--color-surface-primary)] rounded-[var(--radius-lg)]",
          "shadow-lg overflow-auto",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1 rounded-full bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {detail.kind === "image" && (
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">
              {detail.label}
            </h4>
            <img
              src={detail.url}
              alt={detail.label}
              className="w-full h-auto rounded-[var(--radius-md)]"
            />
          </div>
        )}

        {detail.kind === "video" && (
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">
              {detail.label}
            </h4>
            <VideoPlayer
              sourceType="version"
              sourceId={detail.versionId}
              autoPlay
              showControls
              className="w-full rounded-[var(--radius-md)] overflow-hidden"
            />
          </div>
        )}

        {detail.kind === "json" && (
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">
              Metadata
            </h4>
            <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)] p-4 rounded-[var(--radius-md)] overflow-auto max-h-[70vh] whitespace-pre-wrap">
              {JSON.stringify(detail.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
