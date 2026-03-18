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
      <div className="sticky bottom-0 border-t border-border-primary bg-surface-primary p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ReviewStatusBadge status={status} />
          {(status === "rejected" || status === "rework") && latestRejection?.comment && (
            <span className="text-sm text-action-danger">
              Rejection: {latestRejection.comment}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "assigned" && canReview && assignmentId && (
            <Button
              variant="primary"
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
                onClick={() => {
                  setDecisionType("approved");
                  setShowDecisionModal(true);
                }}
              >
                Approve
              </Button>
              <Button
                variant="danger"
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
            <label className="block text-sm font-medium text-text-primary mb-1">
              Comment{" "}
              {decisionType === "rejected" && (
                <span className="text-action-danger">*</span>
              )}
            </label>
            <textarea
              className="w-full bg-surface-secondary text-text-primary border border-border-primary rounded-[var(--radius-lg)] p-3 text-sm min-h-[100px]"
              placeholder={
                decisionType === "rejected"
                  ? "Explain what needs to be fixed..."
                  : "Optional comment..."
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDecisionModal(false)}>
              Cancel
            </Button>
            <Button
              variant={decisionType === "approved" ? "primary" : "danger"}
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
