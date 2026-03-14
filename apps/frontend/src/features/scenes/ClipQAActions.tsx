/**
 * QA action buttons for scene clips — thin wrapper around shared ApprovalActions.
 */

import { ApprovalActions } from "@/components/domain/ApprovalActions";
import type { SceneVideoVersion } from "./types";

interface ClipQAActionsProps {
  clip: SceneVideoVersion;
  onApprove: (clipId: number) => void;
  onUnapprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  onExport?: (clipId: number) => void;
  onDelete?: (clipId: number) => void;
  isApproving?: boolean;
  isUnapproving?: boolean;
  isRejecting?: boolean;
  isDeleting?: boolean;
  isDeleteDisabled?: boolean;
}

export function ClipQAActions({
  clip,
  onApprove,
  onUnapprove,
  onReject,
  onExport,
  onDelete,
  isApproving,
  isUnapproving,
  isRejecting,
  isDeleting,
  isDeleteDisabled,
}: ClipQAActionsProps) {
  const canApprove = clip.qa_status === "pending";
  const canUnapprove = clip.qa_status === "approved" || clip.qa_status === "rejected";

  return (
    <ApprovalActions
      status={(clip.qa_status ?? "pending") as "pending" | "approved" | "rejected"}
      canApprove={canApprove}
      canUnapprove={canUnapprove}
      onApprove={() => onApprove(clip.id)}
      onUnapprove={() => onUnapprove(clip.id)}
      onReject={() => onReject(clip.id)}
      onExport={onExport ? () => onExport(clip.id) : undefined}
      onDelete={onDelete ? () => onDelete(clip.id) : undefined}
      isDeleteDisabled={isDeleteDisabled}
      isApproving={isApproving}
      isUnapproving={isUnapproving}
      isRejecting={isRejecting}
      isDeleting={isDeleting}
    />
  );
}
