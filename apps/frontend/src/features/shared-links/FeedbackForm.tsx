/**
 * Feedback form for external reviewers (PRD-84).
 *
 * Allows viewers to approve/reject and leave text feedback.
 * Disables after submission to prevent duplicates.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";
import { Check, XCircle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useSubmitFeedback } from "./hooks/use-shared-links";
import type { ReviewDecision } from "./types";

interface FeedbackFormProps {
  token: string;
}

export function FeedbackForm({ token }: FeedbackFormProps) {
  const [viewerName, setViewerName] = useState("");
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useSubmitFeedback(token);

  const handleSubmit = useCallback(() => {
    submitMutation.mutate(
      {
        viewer_name: viewerName.trim() || undefined,
        decision: decision ?? undefined,
        feedback_text: feedbackText.trim() || undefined,
      },
      {
        onSuccess: () => setSubmitted(true),
      },
    );
  }, [viewerName, decision, feedbackText, submitMutation]);

  if (submitted) {
    return (
      <Card elevation="sm" padding="lg">
        <Stack gap={3} align="center">
          <div className="rounded-full bg-[var(--color-action-success)]/10 p-[var(--spacing-3)]">
            <Check
              size={iconSizes.xl}
              className="text-[var(--color-action-success)]"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Thank you for your feedback
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your review has been submitted successfully.
          </p>
        </Stack>
      </Card>
    );
  }

  const hasContent =
    decision !== null || feedbackText.trim().length > 0;

  return (
    <Card elevation="sm" padding="lg">
      <Stack gap={4}>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Submit Review
        </h2>

        <Input
          label="Your name (optional)"
          value={viewerName}
          onChange={(e) => setViewerName(e.target.value)}
          placeholder="Jane Doe"
        />

        {/* Decision buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Decision
          </span>
          <div className="flex gap-2">
            <Button
              variant={decision === "approved" ? "primary" : "secondary"}
              size="sm"
              icon={<Check size={iconSizes.sm} />}
              onClick={() =>
                setDecision(decision === "approved" ? null : "approved")
              }
            >
              Approve
            </Button>
            <Button
              variant={decision === "rejected" ? "danger" : "secondary"}
              size="sm"
              icon={<XCircle size={iconSizes.sm} />}
              onClick={() =>
                setDecision(decision === "rejected" ? null : "rejected")
              }
            >
              Reject
            </Button>
          </div>
        </div>

        {/* Comment textarea */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="feedback-text"
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Comments (optional)
          </label>
          <textarea
            id="feedback-text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Add your feedback here..."
            rows={4}
            className="w-full px-3 py-2 text-base bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)] resize-y"
          />
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={submitMutation.isPending}
            disabled={!hasContent}
          >
            Submit Feedback
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
