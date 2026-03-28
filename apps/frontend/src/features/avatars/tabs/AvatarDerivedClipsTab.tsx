/**
 * Avatar derived clips tab — shows imported derived clips grouped by parent version (PRD-153).
 */
import { useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import { EmptyState } from "@/components/domain";
import { TagFilter } from "@/components/domain/TagFilter";
import { Stack } from "@/components/layout";
import { Button, ContextLoader } from "@/components/primitives";
import type { FilterOption } from "@/components/primitives";
import { usePipelineContextSafe } from "@/features/pipelines";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import { BulkImportDialog } from "@/features/scenes/BulkImportDialog";
import { ScanDirectoryDialog } from "@/components/domain/ScanDirectoryDialog";
import { useDerivedClips, type DerivedClipItem } from "@/features/scenes/hooks/useClipManagement";
import type { SceneVideoVersion } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import { FolderSearch, Layers, Play, Upload } from "@/tokens/icons";

interface AvatarDerivedClipsTabProps {
  avatarId: number;
  projectId: number;
}

const STATUS_OPTIONS: FilterOption[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function toPlayable(clip: DerivedClipItem): SceneVideoVersion {
  return {
    id: clip.id, scene_id: clip.scene_id, version_number: clip.version_number,
    source: clip.source, file_path: clip.file_path, file_size_bytes: clip.file_size_bytes,
    duration_secs: clip.duration_secs, width: clip.width, height: clip.height,
    frame_rate: clip.frame_rate, preview_path: clip.preview_path, video_codec: null,
    is_final: clip.is_final, notes: null, qa_status: clip.qa_status,
    qa_reviewed_by: null, qa_reviewed_at: null, qa_rejection_reason: null, qa_notes: null,
    generation_snapshot: null, file_purged: clip.file_purged, deleted_at: null,
    created_at: clip.created_at, updated_at: clip.created_at,
    annotation_count: clip.annotation_count,
    parent_version_id: clip.parent_version_id, clip_index: clip.clip_index,
  };
}

function DerivedClipRow({ clip, onPlay }: { clip: DerivedClipItem; onPlay: () => void }) {
  const videoSrc = getStreamUrl("version", clip.id, "proxy");
  return (
    <button
      type="button"
      onClick={onPlay}
      className="flex items-center gap-3 px-3 py-2 hover:bg-[#161b22] transition-colors cursor-pointer text-left w-full border-b border-[var(--color-border-default)]/30 last:border-b-0"
    >
      <div className="relative h-10 w-16 shrink-0 rounded overflow-hidden bg-[#161b22]">
        {!clip.file_purged && (
          <video src={videoSrc} className="absolute inset-0 w-full h-full object-cover" preload="metadata" muted />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
          <Play size={14} className="text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-mono text-xs">
          {clip.clip_index != null && <span className="text-cyan-400 font-semibold">#{clip.clip_index}</span>}
          <span className="text-[var(--color-text-primary)] truncate">{clip.file_path.split("/").pop()}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {clip.duration_secs != null && <span>{formatDuration(clip.duration_secs)}</span>}
          {clip.qa_status !== "pending" && (
            <><span className="opacity-30">|</span><span className={TERMINAL_STATUS_COLORS[clip.qa_status] ?? ""}>{clip.qa_status}</span></>
          )}
          {clip.annotation_count > 0 && (
            <><span className="opacity-30">|</span><span className="text-orange-400">{clip.annotation_count} annotated</span></>
          )}
        </div>
      </div>
    </button>
  );
}

export function AvatarDerivedClipsTab({ avatarId }: AvatarDerivedClipsTabProps) {
  const pipelineCtx = usePipelineContextSafe();
  const [qaFilter, setQaFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<number[]>([]);
  const [excludeLabelFilter, setExcludeLabelFilter] = useState<number[]>([]);
  const [playingClip, setPlayingClip] = useState<DerivedClipItem | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportFiles, setBulkImportFiles] = useState<File[]>([]);
  const [scanOpen, setScanOpen] = useState(false);


  const { data, isLoading } = useDerivedClips(avatarId, {
    qaStatus: qaFilter.length > 0 ? qaFilter.join(",") : undefined,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
  });

  const clips = data?.items ?? [];

  const grouped = useMemo(() => {
    const map = new Map<number, DerivedClipItem[]>();
    for (const clip of clips) {
      const parentId = clip.parent_version_id ?? 0;
      const list = map.get(parentId) ?? [];
      list.push(clip);
      map.set(parentId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.clip_index ?? 0) - (b.clip_index ?? 0));
    }
    return map;
  }, [clips]);

  const flatClips = useMemo(() => {
    const result: DerivedClipItem[] = [];
    for (const [, list] of grouped) result.push(...list);
    return result;
  }, [grouped]);

  const playingIndex = playingClip ? flatClips.findIndex((c) => c.id === playingClip.id) : -1;

  if (isLoading) {
    return <div className="flex justify-center py-12"><ContextLoader size={48} /></div>;
  }

  return (
    <Stack gap={4}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="xs" variant="secondary" icon={<Upload size={12} />} onClick={() => setBulkImportOpen(true)}>
          Import
        </Button>
        {pipelineCtx?.pipelineId && (
          <Button size="xs" variant="secondary" icon={<FolderSearch size={12} />} onClick={() => setScanOpen(true)}>
            Scan Directory
          </Button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setQaFilter((prev) => prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value])}
              className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors ${
                qaFilter.includes(opt.value) ? "bg-[var(--color-action-primary)] text-white" : "bg-[#161b22] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {clips.length > 0 && (
        <TagFilter
          selectedTagIds={labelFilter}
          onSelectionChange={setLabelFilter}
          excludedTagIds={excludeLabelFilter}
          onExclusionChange={setExcludeLabelFilter}
          pipelineId={pipelineCtx?.pipelineId}
          entityType="derived_clip"
        />
      )}

      {clips.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No derived clips"
          description="Import derived clips (LoRA chunks, test renders) using the Import or Scan Directory buttons."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(grouped.entries()).map(([parentId, groupClips]) => {
            const first = groupClips[0]!;
            const sectionTitle = parentId > 0
              ? `${first.scene_type_name} — ${first.track_name} — v${first.version_number} (${groupClips.length} clips)`
              : `Unlinked (${groupClips.length} clips)`;
            return (
              <CollapsibleSection key={parentId} title={sectionTitle} card defaultOpen>
                {groupClips.map((clip) => (
                  <DerivedClipRow key={clip.id} clip={clip} onPlay={() => setPlayingClip(clip)} />
                ))}
              </CollapsibleSection>
            );
          })}
        </div>
      )}

      <ClipPlaybackModal
        clip={playingClip ? toPlayable(playingClip) : null}
        onClose={() => setPlayingClip(null)}
        onPrev={playingIndex > 0 ? () => setPlayingClip(flatClips[playingIndex - 1]!) : undefined}
        onNext={playingIndex >= 0 && playingIndex < flatClips.length - 1 ? () => setPlayingClip(flatClips[playingIndex + 1]!) : undefined}
        pipelineId={pipelineCtx?.pipelineId}
        meta={playingClip ? { projectName: "", avatarName: "", sceneTypeName: playingClip.scene_type_name, trackName: playingClip.track_name } : undefined}
      />

      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => { setBulkImportOpen(false); setBulkImportFiles([]); }}
        sceneId={clips[0]?.scene_id ?? 0}
        initialFiles={bulkImportFiles.length > 0 ? bulkImportFiles : undefined}
        onSuccess={() => { setBulkImportOpen(false); setBulkImportFiles([]); }}
      />

      {pipelineCtx?.pipelineId && (
        <ScanDirectoryDialog
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          pipelineId={pipelineCtx.pipelineId}
          onSuccess={() => setScanOpen(false)}
        />
      )}
    </Stack>
  );
}
