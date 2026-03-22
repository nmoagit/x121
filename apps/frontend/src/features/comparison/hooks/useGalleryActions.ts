/**
 * Shared gallery mutation actions (PRD-68).
 *
 * Encapsulates approve/reject/flag mutation boilerplate used by
 * both SceneGallery and AvatarAllScenes.
 */

import { useApproveSegment, useRejectSegment, useFlagSegment } from "@/features/review/hooks/use-review";

import type { ComparisonCell } from "../types";
import { APPROVE_ALL_QA_THRESHOLD, DEFAULT_SEGMENT_VERSION } from "../types";

export interface GalleryActions {
  handleApprove: (segmentId: number) => void;
  handleReject: (segmentId: number) => void;
  handleFlag: (segmentId: number) => void;
  handleApproveAllPassing: (cells: ComparisonCell[]) => void;
}

export function useGalleryActions(): GalleryActions {
  const approveMutation = useApproveSegment();
  const rejectMutation = useRejectSegment();
  const flagMutation = useFlagSegment();

  const handleApprove = (segmentId: number) => {
    approveMutation.mutate({
      segmentId,
      input: { segment_version: DEFAULT_SEGMENT_VERSION },
    });
  };

  const handleReject = (segmentId: number) => {
    rejectMutation.mutate({
      segmentId,
      input: { segment_version: DEFAULT_SEGMENT_VERSION },
    });
  };

  const handleFlag = (segmentId: number) => {
    flagMutation.mutate({
      segmentId,
      input: { segment_version: DEFAULT_SEGMENT_VERSION },
    });
  };

  const handleApproveAllPassing = (cells: ComparisonCell[]) => {
    for (const cell of cells) {
      if (
        cell.segment_id &&
        cell.qa_score !== null &&
        cell.qa_score >= APPROVE_ALL_QA_THRESHOLD &&
        cell.approval_status !== "approved"
      ) {
        handleApprove(cell.segment_id);
      }
    }
  };

  return { handleApprove, handleReject, handleFlag, handleApproveAllPassing };
}
