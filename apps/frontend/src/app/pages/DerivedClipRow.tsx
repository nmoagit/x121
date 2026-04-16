/**
 * Row component for derived clip list items. Shows parent version,
 * clip index badge, and derived-specific metadata prominently.
 */

import { useState, useRef, useEffect } from "react";

import { Checkbox } from "@/components/primitives";
import { ContextLoader } from "@/components/primitives";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { isEmptyClip, isPurgedClip } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { Ban, CheckCircle, Play, XCircle } from "@/tokens/icons";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface DerivedClipRowProps {
  clip: ClipBrowseItem;
  onPlay: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}

export function DerivedClipRow({ clip, onPlay, onNavigate, onApprove, onReject, selected, onToggleSelect }: DerivedClipRowProps) {
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

  useEffect(() => {
    if (!isVisible || isPurgedClip(clip)) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = videoSrc;
    v.onloadeddata = () => setVideoReady(true);
    return () => { v.src = ""; v.onloadeddata = null; };
  }, [isVisible, videoSrc, clip]);

  const borderColor = clip.qa_status === "approved"
    ? "border-green-500"
    : clip.qa_status === "rejected"
      ? "border-red-500"
      : "border-[var(--color-border-default)]";

  return (
    <div
      ref={ref}
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        selected ? "ring-2 ring-blue-500/50" : ""
      } ${borderColor} ${!clip.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Selection */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
        </div>

        {/* Clip index badge */}
        {clip.clip_index != null && (
          <span className="shrink-0 rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-data-cyan)]">
            #{clip.clip_index}
          </span>
        )}

        {/* Video thumbnail */}
        {isPurgedClip(clip) ? (
          <div className="relative flex h-14 w-20 shrink-0 items-center justify-center rounded bg-[var(--color-surface-secondary)]">
            <Ban size={18} className="text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="group/play relative h-14 w-20 shrink-0 rounded overflow-hidden bg-[var(--color-surface-secondary)] cursor-pointer"
          >
            {videoReady ? (
              <video src={videoSrc} className="absolute inset-0 w-full h-full object-cover" preload="metadata" muted />
            ) : isVisible ? (
              <div className="absolute inset-0 flex items-center justify-center"><ContextLoader size={14} /></div>
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
              <Play size={18} className="text-white" />
            </div>
          </button>
        )}

        {/* Metadata */}
        <button type="button" onClick={onNavigate} className={`flex min-w-0 flex-1 flex-col gap-0.5 text-left cursor-pointer ${TYPO_DATA}`}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">{clip.avatar_name}</span>
            <span className="text-[var(--color-text-muted)] uppercase">{clip.scene_type_name}</span>
            <span className={TRACK_TEXT_COLORS[clip.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{clip.track_name}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className="text-[var(--color-data-cyan)] font-semibold">v{clip.version_number}</span>
            {clip.parent_version_id != null && (
              <><span className="opacity-30">|</span><span className="text-[var(--color-data-violet)]">parent v{clip.parent_version_id}</span></>
            )}
            {clip.is_final && <><span className="opacity-30">|</span><span className="text-[var(--color-data-green)]">final</span></>}
            {clip.qa_status !== "pending" && (
              <><span className="opacity-30">|</span><span className={TERMINAL_STATUS_COLORS[clip.qa_status] ?? "text-[var(--color-text-muted)]"}>{clip.qa_status}</span></>
            )}
            {isPurgedClip(clip) && <><span className="opacity-30">|</span><span className="text-[var(--color-data-orange)]">purged</span></>}
            {!isPurgedClip(clip) && isEmptyClip(clip) && <><span className="opacity-30">|</span><span className="text-[var(--color-data-orange)]">empty</span></>}
            {clip.annotation_count > 0 && <><span className="opacity-30">|</span><span className="text-[var(--color-data-orange)]">{clip.annotation_count} annotated</span></>}
            <span className="opacity-30">|</span>
            <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
            <span className="opacity-30">|</span>
            <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
            <span className="opacity-30">|</span>
            <span>{clip.project_name}</span>
            <span className="opacity-30">|</span>
            <span>{formatDateTime(clip.created_at)}</span>
          </div>
        </button>

        {/* Approve / Reject */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onApprove}
            className={`p-1 rounded transition-colors ${clip.qa_status === "approved" ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)]"}`}
            title={clip.qa_status === "approved" ? "Approved" : "Approve"}
          >
            <CheckCircle size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`p-1 rounded transition-colors ${clip.qa_status === "rejected" ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)]"}`}
            title={clip.qa_status === "rejected" ? "Rejected" : "Reject"}
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
