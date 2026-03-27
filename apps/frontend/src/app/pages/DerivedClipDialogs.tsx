/**
 * Dialog/modal group for the DerivedClipsPage — playback, bulk actions,
 * reject, label, scan directory. Extracted to keep the page under 200 lines.
 */

import { BulkActionBar, BulkRejectDialog, BulkLabelDialog, ExportStatusPanel } from "@/components/domain";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import { clipBrowseToPlayable } from "@/features/scenes/clip-utils";
import { ScanDirectoryDialog } from "@/features/scenes/ScanDirectoryDialog";
import type { BulkSelection } from "@/hooks/useBulkSelection";
import type { BulkOperations } from "@/hooks/useBulkOperations";

interface DerivedClipDialogsProps {
  clips: ClipBrowseItem[];
  playingClipId: number | null;
  onClosePlayback: () => void;
  onSetPlayingId: (id: number) => void;
  onApprove: (clip: ClipBrowseItem) => void;
  onReject: (clip: ClipBrowseItem) => void;
  pipelineId: number | undefined;
  bulk: BulkSelection;
  bulkOps: BulkOperations;
  total: number;
  pageIds: number[];
  scanOpen: boolean;
  onCloseScan: () => void;
}

export function DerivedClipDialogs({
  clips,
  playingClipId,
  onClosePlayback,
  onSetPlayingId,
  onApprove,
  onReject,
  pipelineId,
  bulk,
  bulkOps,
  total,
  pageIds,
  scanOpen,
  onCloseScan,
}: DerivedClipDialogsProps) {
  const playingLocalIndex = playingClipId !== null ? clips.findIndex((c) => c.id === playingClipId) : -1;
  const playingClipData = playingLocalIndex >= 0 ? clips[playingLocalIndex] : null;

  return (
    <>
      <ClipPlaybackModal
        clip={playingClipData ? clipBrowseToPlayable(playingClipData) : null}
        onClose={onClosePlayback}
        onPrev={playingLocalIndex > 0 ? () => onSetPlayingId(clips[playingLocalIndex - 1]!.id) : undefined}
        onNext={playingLocalIndex >= 0 && playingLocalIndex < clips.length - 1 ? () => onSetPlayingId(clips[playingLocalIndex + 1]!.id) : undefined}
        onApprove={playingClipData ? () => onApprove(playingClipData) : undefined}
        onReject={playingClipData ? () => onReject(playingClipData) : undefined}
        pipelineId={pipelineId}
        meta={playingClipData ? {
          projectName: playingClipData.project_name,
          avatarName: playingClipData.avatar_name,
          sceneTypeName: playingClipData.scene_type_name,
          trackName: playingClipData.track_name,
        } : undefined}
      />

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        totalCount={total}
        selectAllMatching={bulk.selectAllMatching}
        onApproveAll={bulkOps.handleBulkApprove}
        onRejectAll={() => bulkOps.setRejectDialogOpen(true)}
        onAddLabel={() => bulkOps.setLabelDialogOpen("add")}
        onRemoveLabel={() => bulkOps.setLabelDialogOpen("remove")}
        onExport={bulkOps.handleExport}
        onClearSelection={bulk.clearAll}
        onSelectAllMatching={() => bulk.selectAll(total)}
        isAllPageSelected={bulk.isAllPageSelected(pageIds)}
        pageItemCount={clips.length}
      >
        {bulkOps.exportJob && <ExportStatusPanel job={bulkOps.exportJob} onDismiss={bulkOps.dismissExport} />}
      </BulkActionBar>

      <BulkRejectDialog
        open={bulkOps.rejectDialogOpen}
        count={bulk.selectedCount}
        onConfirm={bulkOps.handleBulkRejectConfirm}
        onCancel={() => bulkOps.setRejectDialogOpen(false)}
        loading={bulkOps.rejectLoading}
      />

      <BulkLabelDialog
        open={bulkOps.labelDialogOpen !== null}
        mode={bulkOps.labelDialogOpen ?? "add"}
        count={bulk.selectedCount}
        pipelineId={pipelineId}
        entityType="scene_video_version"
        entityIds={Array.from(bulk.selectedIds)}
        onConfirm={bulkOps.handleBulkAddLabel}
        onConfirmRemove={bulkOps.handleBulkRemoveLabel}
        onCancel={() => bulkOps.setLabelDialogOpen(null)}
      />

      {pipelineId != null && (
        <ScanDirectoryDialog open={scanOpen} onClose={onCloseScan} pipelineId={pipelineId} />
      )}
    </>
  );
}
