import { useState } from "react";
import { Button } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import {
  useStartReview,
  useSubmitDecision,
  useSubmitForRereview,
  useCharacterReviewHistory,
} from "./hooks/use-character-review";
import { REVIEW_STATUS_MAP } from "./types";
import { useAuthStore } from "@/stores/auth-store";

interface CharacterReviewControlsProps {
  characterId: number;
  reviewStatusId: number;
  assignmentId?: number;
  assignedReviewerUserId?: number;
}

export function CharacterReviewControls({
  characterId,
  reviewStatusId,
  assignmentId,
  assignedReviewerUserId,
}: CharacterReviewControlsProps) {
  const user = useAuthStore((s) => s.user);
  const startReview = useStartReview();
  const submitDecision = useSubmitDecision();
  const submitRereview = useSubmitForRereview();
  const { data: history } = useCharacterReviewHistory(characterId);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<"approved" | "rejected">("approved");
  const [comment, setComment] = useState("");

  const status = REVIEW_STATUS_MAP[reviewStatusId] ?? "unassigned";
  const isAssignedReviewer = user?.id === assignedReviewerUserId;
  const isAdmin = user?.role === "admin";
  const canReview = isAssignedReviewer || isAdmin;

  const latestRejection = history?.find((e) => e.action === "rejected");

  const handleDecision = () => {
    if (!assignmentId) return;
    if (decisionType === "rejected" && !comment.trim()) return;
    submitDecision.mutate(
      { assignmentId, decision: decisionType, comment: comment || undefined },
      {
        onSuccess: () => {
          setShowDecisionModal(false);
          setComment("");
        },
      },
    );
  };

  if (status === "unassigned") return null;

  return (
    <>
      <div className="sticky bottom-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-3">
          <ReviewStatusBadge status={status} />
          {(status === "rejected" || status === "rework") && latestRejection?.comment && (
            <span className="text-red-400 truncate max-w-[300px]">
              {latestRejection.comment}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "assigned" && canReview && assignmentId && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => startReview.mutate(assignmentId)}
              disabled={startReview.isPending}
            >
              Start Review
            </Button>
          )}

          {status === "in_review" && canReview && (
            <>
              <Button
                variant="primary"
                size="xs"
                onClick={() => {
                  setDecisionType("approved");
                  setShowDecisionModal(true);
                }}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                size="xs"
                onClick={() => {
                  setDecisionType("rejected");
                  setShowDecisionModal(true);
                }}
              >
                Reject
              </Button>
            </>
          )}

          {status === "rework" && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => submitRereview.mutate(characterId)}
              disabled={submitRereview.isPending}
            >
              Submit for Re-review
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={showDecisionModal}
        title={decisionType === "approved" ? "Approve Model" : "Reject Model"}
        onClose={() => setShowDecisionModal(false)}
      >
        <div className="space-y-4">
          <div>
            <span className="block font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Comment{" "}
              {decisionType === "rejected" && (
                <span className="text-red-400">*</span>
              )}
            </span>
            <textarea
              className="w-full bg-[#0d1117] text-cyan-400 border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-3 font-mono text-xs min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
              placeholder={
                decisionType === "rejected"
                  ? "Explain what needs to be fixed..."
                  : "Optional comment..."
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
            <Button variant="ghost" size="sm" onClick={() => setShowDecisionModal(false)}>
              Cancel
            </Button>
            <Button
              variant={decisionType === "approved" ? "primary" : "danger"}
              size="sm"
              onClick={handleDecision}
              disabled={
                submitDecision.isPending ||
                (decisionType === "rejected" && !comment.trim())
              }
            >
              {decisionType === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
