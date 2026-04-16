/**
 * BrowseClipCard — grid-view card for browsing scene clips.
 * Shared between ScenesPage and DerivedClipsPage.
 */

import { useRef, useState, useEffect } from "react";

import { Checkbox, ContextLoader } from "@/components/primitives";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { isPurgedClip } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { Ban, CheckCircle, Play, XCircle } from "@/tokens/icons";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* -------------------------------------------------------------------------- */

export interface BrowseClipCardProps {
  clip: ClipBrowseItem;
  onPlay: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}

/* -------------------------------------------------------------------------- */

export function BrowseClipCard({
  clip,
  onPlay,
  onNavigate,
  onApprove,
  onReject,
  selected,
  onToggleSelect,
}: BrowseClipCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoSrc = getStreamUrl("version", clip.id, "proxy");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preload video offscreen once visible.
  useEffect(() => {
    if (!isVisible || isPurgedClip(clip)) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = videoSrc;
    v.onloadeddata = () => setVideoReady(true);
    return () => { v.src = ""; v.onloadeddata = null; };
  }, [isVisible, videoSrc, clip]);

  return (
    <div
      ref={ref}
      className={`relative rounded-[var(--radius-lg)] border overflow-hidden transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        selected ? "ring-2 ring-blue-500/50" : ""
      } ${
        clip.qa_status === "approved"
          ? "border-green-500"
          : clip.qa_status === "rejected"
            ? "border-red-500"
            : "border-[var(--color-border-default)]"
      } ${!clip.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      {/* Selection checkbox overlay */}
      <div
        className="absolute top-1 left-1 z-10 rounded bg-[var(--color-surface-badge-overlay)] p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
      </div>

      {/* Video preview */}
      {isPurgedClip(clip) ? (
        <div className="flex aspect-video items-center justify-center bg-[var(--color-surface-secondary)]">
          <Ban size={24} className="text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          className="group/play relative aspect-video w-full cursor-pointer bg-[var(--color-surface-secondary)]"
        >
          {videoReady ? (
            <video
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : isVisible ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ContextLoader size={20} />
            </div>
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/play:opacity-100 transition-opacity">
            <Play size={24} className="text-white drop-shadow-lg" />
          </div>
        </button>
      )}

      {/* Metadata + actions */}
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={onNavigate}
          className="min-w-0 flex-1 text-left cursor-pointer"
        >
          <div className={`flex items-center gap-1.5 ${TYPO_DATA}`}>
            <span className="truncate font-medium text-[var(--color-text-primary)]">{clip.avatar_name}</span>
            <span className="shrink-0 text-[var(--color-text-muted)] uppercase text-[10px]">{clip.scene_type_name}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
            <span className="text-[var(--color-data-cyan)] font-semibold">v{clip.version_number}</span>
            <span className={TRACK_TEXT_COLORS[clip.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{clip.track_name}</span>
            {clip.clip_index != null && <span className="text-[var(--color-data-cyan)]">#{clip.clip_index}</span>}
            {clip.qa_status !== "pending" && (
              <span className={TERMINAL_STATUS_COLORS[clip.qa_status] ?? "text-[var(--color-text-muted)]"}>{clip.qa_status}</span>
            )}
            {clip.duration_secs != null && <span>{formatDuration(clip.duration_secs)}</span>}
          </div>
        </button>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onApprove} className={`p-0.5 rounded transition-colors ${clip.qa_status === "approved" ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)]"}`} title="Approve">
            <CheckCircle size={14} />
          </button>
          <button type="button" onClick={onReject} className={`p-0.5 rounded transition-colors ${clip.qa_status === "rejected" ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)]"}`} title="Reject">
            <XCircle size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
