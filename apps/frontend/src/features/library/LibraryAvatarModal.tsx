/**
 * Modal for previewing a library avatar's assets.
 *
 * Shows seed/track images, scene videos with a final version, and metadata JSON.
 * Each item is clickable to view full-size image, play video, or inspect JSON.
 */

import { useEffect, useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";

import { useAvatarPath } from "@/hooks/usePipelinePath";
import { Modal } from "@/components/composite";
import { Button, FlagIcon, ProgressiveImage, ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  TERMINAL_DIVIDER,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_TH,
  TRACK_TEXT_COLORS,
} from "@/lib/ui-classes";
import { useAvatarMetadata, useAvatarSettings } from "@/features/avatars/hooks/use-avatar-detail";
import { useAvatarSpeeches, useSpeechTypes } from "@/features/avatars/hooks/use-avatar-speeches";
import { useLanguages } from "@/features/avatars/hooks/use-languages";
import { getVoiceId } from "@/features/avatars/types";
import type { AvatarSpeech } from "@/features/avatars/types";
import { useMediaVariants } from "@/features/media/hooks/use-media-variants";
import { variantThumbnailUrl, variantMediaUrl } from "@/features/media/utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useSceneCatalogue } from "@/features/scene-catalogue/hooks/use-scene-catalogue";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useAvatarScenes } from "@/features/scenes/hooks/useAvatarScenes";
import { sceneHasVideo } from "@/features/scenes/types";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { getStreamUrl } from "@/features/video-player/hooks/use-video-metadata";
import { ArrowRight, ChevronLeft, ChevronRight, Film, FileText, Image, Maximize2, MessageSquare, Mic, Minimize2, Play } from "@/tokens/icons";

import type { LibraryAvatar } from "./types";

/* --------------------------------------------------------------------------
   Sub-views for detail panels
   -------------------------------------------------------------------------- */

type DetailView =
  | { kind: "image"; url: string; label: string; index: number; total: number }
  | { kind: "video"; versionId: number; label: string; index: number; total: number }
  | { kind: "json"; data: Record<string, unknown> }
  | { kind: "speech"; label: string; entries: AvatarSpeech[] };

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LibraryAvatarModalProps {
  avatar: LibraryAvatar;
  open: boolean;
  onClose: () => void;
  /** Navigate to the previous avatar. Omit to hide the button. */
  onPrev?: () => void;
  /** Navigate to the next avatar. Omit to hide the button. */
  onNext?: () => void;
}

export function LibraryAvatarModal({
  avatar,
  open,
  onClose,
  onPrev,
  onNext,
}: LibraryAvatarModalProps) {
  const avatarPathFn = useAvatarPath();
  const [detail, setDetail] = useState<DetailView | null>(null);

  // Clear detail view when avatar changes
  useEffect(() => { setDetail(null); }, [avatar.id]);

  // Keyboard navigation: left/right arrows
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onPrev, onNext]);

  // Fetch avatar assets
  const { data: variants, isLoading: loadingImages } = useMediaVariants(avatar.id);
  const { data: scenes, isLoading: loadingScenes } = useAvatarScenes(avatar.id);
  const { data: metadata, isLoading: loadingMeta } = useAvatarMetadata(avatar.id);
  const { data: speeches } = useAvatarSpeeches(avatar.id);
  const { data: speechTypes } = useSpeechTypes();
  const { data: languages } = useLanguages();
  const { data: settings } = useAvatarSettings(avatar.project_id, avatar.id);

  // Fetch scene types and tracks for name resolution
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneCatalogue } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);

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

  /** Structured scene info for colored rendering. */
  const sceneInfo = (scene: { scene_type_id: number; track_id: number | null; transition_mode?: string }) => {
    const st = sceneTypeMap.get(scene.scene_type_id);
    const sceneName = st?.name ?? `Type ${scene.scene_type_id}`;
    const isClothesOff = scene.transition_mode === "clothes_off";
    if (isClothesOff) {
      return { sceneName, trackName: "clothes off", trackSlug: "clothes_off" };
    }
    if (scene.track_id != null) {
      const trackName = trackMap.get(scene.track_id) ?? `Track ${scene.track_id}`;
      const trackSlug = trackName.toLowerCase().replace(/\s+/g, "_");
      return { sceneName, trackName, trackSlug };
    }
    return { sceneName, trackName: null, trackSlug: null };
  };

  const hasMetadata = metadata && Object.keys(metadata).length > 0;
  const voiceId = getVoiceId(settings as Record<string, unknown> | null);

  // Build speech summary groups with full entries for expand
  const speechGroups = useMemo(() => {
    if (!speeches || speeches.length === 0) return new Map<string, { typeName: string; langCode: string; flagCode: string; entries: AvatarSpeech[] }>();
    const typeMap = new Map(speechTypes?.map((t) => [t.id, t.name]) ?? []);
    const langMap = new Map(languages?.map((l) => [l.id, { code: l.code, flag_code: l.flag_code }]) ?? []);
    const groups = new Map<string, { typeName: string; langCode: string; flagCode: string; entries: AvatarSpeech[] }>();
    for (const s of speeches) {
      const key = `${s.speech_type_id}-${s.language_id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(s);
      } else {
        const lang = langMap.get(s.language_id);
        groups.set(key, {
          typeName: typeMap.get(s.speech_type_id) ?? `type_${s.speech_type_id}`,
          langCode: lang?.code ?? "en",
          flagCode: lang?.flag_code ?? "gb",
          entries: [s],
        });
      }
    }
    return groups;
  }, [speeches, speechTypes, languages]);

  const isLoading = loadingImages || loadingScenes || loadingMeta;

  return (
    <Modal open={open} onClose={onClose} title={avatar.name} size="3xl">
      <div className="flex flex-col gap-4 min-h-[80vh]">
        {/* Header: nav + info + go-to */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(onPrev || onNext) && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={!onPrev}
                  onClick={onPrev}
                  className="p-0.5 rounded-[2px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-default transition-colors"
                  aria-label="Previous model"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={!onNext}
                  onClick={onNext}
                  className="p-0.5 rounded-[2px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-default transition-colors"
                  aria-label="Next model"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {avatar.project_name}
              {avatar.group_name && ` / ${avatar.group_name}`}
            </p>
          </div>
          <Link
            to={avatarPathFn(avatar.project_id, avatar.id) as string}
            search={{ tab: undefined, scene: undefined }}
          >
            <Button variant="secondary" size="sm">
              Go to Model
              <ArrowRight size={14} aria-hidden className="ml-1" />
            </Button>
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <ContextLoader size={80} />
          </div>
        )}

        {!isLoading && (
          <div className="flex flex-col gap-6">
            {/* Seed / Track Images */}
            {seedImages.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  <Image size={14} aria-hidden />
                  seed images
                  <span className="text-cyan-400">{seedImages.length}</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {seedImages.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setDetail({
                          kind: "image",
                          url: variantMediaUrl(v.file_path),
                          label: v.variant_label || v.variant_type || "Image",
                          index: i,
                          total: seedImages.length,
                        })
                      }
                      className={cn(
                        "relative aspect-square rounded-[var(--radius-md)] overflow-hidden",
                        "bg-[#161b22] cursor-pointer",
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
                      <span className={cn(
                        "absolute bottom-0 inset-x-0 bg-black/60 font-mono text-[10px] px-1.5 py-0.5 truncate",
                        TRACK_TEXT_COLORS[(v.variant_type ?? "").toLowerCase()] ?? "text-cyan-400",
                      )}>
                        {(v.variant_type || v.variant_label || "image").toLowerCase()}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Scene Videos */}
            {scenesWithVideo.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  <Film size={14} aria-hidden />
                  scenes
                  <span className="text-cyan-400">{scenesWithVideo.length}</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {scenesWithVideo.map((s, i) => {
                    const info = sceneInfo(s);
                    const trackColor = info.trackSlug ? (TRACK_TEXT_COLORS[info.trackSlug] ?? "text-[var(--color-text-muted)]") : "";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setDetail({
                            kind: "video",
                            versionId: s.latest_version_id!,
                            label: `${info.sceneName}${info.trackName ? ` — ${info.trackName}` : ""}`,
                            index: i,
                            total: scenesWithVideo.length,
                          })
                        }
                        className={cn(
                          "group/play relative aspect-video rounded-[var(--radius-md)] overflow-hidden",
                          "bg-[#161b22] cursor-pointer",
                          "ring-1 ring-[var(--color-border-default)]",
                          "hover:ring-[var(--color-border-accent)] transition-all",
                        )}
                      >
                        <VideoThumb versionId={s.latest_version_id!} />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
                          <Play size={24} className="text-white" />
                        </div>
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 font-mono text-[10px] px-1.5 py-0.5 truncate">
                          <span className="text-[var(--color-text-primary)]">{info.sceneName.toLowerCase()}</span>
                          {info.trackName && (
                            <span className={trackColor}> {info.trackName.toLowerCase()}</span>
                          )}
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
                <h3 className="flex items-center gap-2 font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  <FileText size={16} aria-hidden />
                  Metadata
                </h3>
                <button
                  type="button"
                  onClick={() => setDetail({ kind: "json", data: metadata })}
                  className={cn(
                    "w-full text-left p-3 rounded-[var(--radius-md)]",
                    "bg-[#161b22] cursor-pointer",
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

            {/* Speech */}
            {speechGroups.size > 0 && (
              <section>
                <h3 className="flex items-center gap-2 font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  <MessageSquare size={16} aria-hidden />
                  Speech
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{speeches?.length ?? 0}</span>
                </h3>
                <div className={cn(TERMINAL_PANEL, "overflow-hidden")}>
                  <table className="w-full text-xs">
                    <thead className="bg-[#161b22]">
                      <tr>
                        <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Type</th>
                        <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Lang</th>
                        <th className={cn(TERMINAL_TH, "px-3 py-1.5 text-right")}>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...speechGroups.entries()].map(([groupKey, g]) => (
                        <tr
                          key={groupKey}
                          className={cn(
                            TERMINAL_DIVIDER,
                            TERMINAL_ROW_HOVER,
                            "cursor-pointer",
                          )}
                          onClick={() => setDetail({
                            kind: "speech",
                            label: `${g.typeName} — ${g.langCode.toUpperCase()}`,
                            entries: g.entries,
                          })}
                        >
                          <td className="px-3 py-1.5 font-mono text-xs text-cyan-400">{g.typeName}</td>
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1">
                              <FlagIcon flagCode={g.flagCode} size={10} />
                              <span className="font-mono text-[10px] text-[var(--color-text-muted)] uppercase">{g.langCode}</span>
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-muted)]">{g.entries.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Voice ID */}
            {voiceId && (
              <section>
                <h3 className="flex items-center gap-2 font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  <Mic size={16} aria-hidden />
                  Voice ID
                </h3>
                <div className="flex items-center gap-[var(--spacing-2)]">
                  <span className="font-mono text-xs text-green-400">Configured</span>
                  <span className="opacity-30">|</span>
                  <span className="font-mono text-xs text-[var(--color-text-muted)] truncate">{voiceId}</span>
                </div>
              </section>
            )}

            {/* Empty state */}
            {seedImages.length === 0 && scenesWithVideo.length === 0 && !hasMetadata && speechGroups.size === 0 && !voiceId && (
              <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
                No assets found for this avatar.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail overlay */}
      {detail && (
        <DetailOverlay
          detail={detail}
          onClose={() => setDetail(null)}
          onPrev={
            (detail.kind === "image" && detail.index > 0)
              ? () => { const v = seedImages[detail.index - 1]; if (!v) return; setDetail({ kind: "image", url: variantMediaUrl(v.file_path), label: v.variant_label || v.variant_type || "Image", index: detail.index - 1, total: seedImages.length }); }
              : (detail.kind === "video" && detail.index > 0)
                ? () => { const s = scenesWithVideo[detail.index - 1]; if (!s) return; const info = sceneInfo(s); setDetail({ kind: "video", versionId: s.latest_version_id!, label: `${info.sceneName}${info.trackName ? ` — ${info.trackName}` : ""}`, index: detail.index - 1, total: scenesWithVideo.length }); }
                : undefined
          }
          onNext={
            (detail.kind === "image" && detail.index < detail.total - 1)
              ? () => { const v = seedImages[detail.index + 1]; if (!v) return; setDetail({ kind: "image", url: variantMediaUrl(v.file_path), label: v.variant_label || v.variant_type || "Image", index: detail.index + 1, total: seedImages.length }); }
              : (detail.kind === "video" && detail.index < detail.total - 1)
                ? () => { const s = scenesWithVideo[detail.index + 1]; if (!s) return; const info = sceneInfo(s); setDetail({ kind: "video", versionId: s.latest_version_id!, label: `${info.sceneName}${info.trackName ? ` — ${info.trackName}` : ""}`, index: detail.index + 1, total: scenesWithVideo.length }); }
                : undefined
          }
        />
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
  onPrev,
  onNext,
}: {
  detail: DetailView;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); e.stopPropagation(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); e.stopPropagation(); onNext(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  const detailTitle = detail.kind === "image" || detail.kind === "video"
    ? `${detail.label}  ${detail.index + 1}/${detail.total}`
    : detail.kind === "json"
      ? "Metadata"
      : detail.kind === "speech"
        ? detail.label
        : "";

  return (
    <Modal
      open
      onClose={onClose}
      title={detailTitle}
      size={expanded ? "full" : "3xl"}
    >
      <div className="flex flex-col gap-[var(--spacing-3)]">
        {detail.kind === "image" && (
          <>
            {/* Image with expand overlay */}
            <div className="group/img relative" onDoubleClick={() => setExpanded((v) => !v)}>
              <div className="flex justify-center bg-black rounded-[var(--radius-md)] overflow-hidden">
                <LoadingImage
                  src={detail.url}
                  alt={detail.label}
                  className="max-h-[60vh] object-contain"
                />
              </div>
              <button
                type="button"
                className="absolute top-2 right-2 z-20 p-1.5 rounded bg-black/50 text-white/70 hover:text-white hover:bg-black/70 opacity-0 group-hover/img:opacity-100 transition-all"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Compact" : "Expand"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            {/* Prev / Next navigation */}
            {(onPrev || onNext) && (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  disabled={!onPrev}
                  onClick={onPrev}
                  className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={!onNext}
                  onClick={onNext}
                  className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  aria-label="Next image"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {detail.kind === "video" && (
          <>
            {/* Video with expand overlay */}
            <div className="group/video relative" onDoubleClick={() => setExpanded((v) => !v)}>
              <VideoPlayer
                sourceType="version"
                sourceId={detail.versionId}
                quality="full"
                autoPlay
                showControls
              />
              <button
                type="button"
                className="absolute right-2 top-2 z-20 p-1.5 rounded bg-black/50 text-white/70 hover:text-white hover:bg-black/70 opacity-0 group-hover/video:opacity-100 transition-all"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Compact" : "Expand"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            {/* Prev / Next navigation */}
            {(onPrev || onNext) && (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  disabled={!onPrev}
                  onClick={onPrev}
                  className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  aria-label="Previous video"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={!onNext}
                  onClick={onNext}
                  className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  aria-label="Next video"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {detail.kind === "json" && (
          <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)] p-4 rounded-[var(--radius-md)] overflow-auto max-h-[70vh] whitespace-pre-wrap">
            {JSON.stringify(detail.data, null, 2)}
          </pre>
        )}

        {detail.kind === "speech" && (
          <ul className="space-y-2 max-h-[70vh] overflow-auto">
            {detail.entries.map((s) => (
              <li
                key={s.id}
                className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)] px-3 py-2 rounded-[var(--radius-md)]"
              >
                {s.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Loading helpers — show spinner until media loads
   -------------------------------------------------------------------------- */

function LoadingImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ContextLoader size={48} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(className, "transition-opacity duration-300", !loaded && "opacity-0")}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function VideoThumb({ versionId }: { versionId: number }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <>
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ContextLoader size={32} />
        </div>
      )}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">unavailable</span>
        </div>
      )}
      {!errored && (
        <video
          src={getStreamUrl("version", versionId, "proxy")}
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loaded && "opacity-0")}
          preload="metadata"
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </>
  );
}
