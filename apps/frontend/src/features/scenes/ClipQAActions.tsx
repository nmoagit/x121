import { Button } from "@/components/primitives/Button";
import { Check, X } from "@/tokens/icons";
import type { SceneVideoVersion } from "./types";

interface ClipQAActionsProps {
  clip: SceneVideoVersion;
  onApprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export function ClipQAActions({
  clip,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: ClipQAActionsProps) {
  if (clip.qa_status === "approved") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
          bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
      >
        <Check size={12} /> Approved
      </span>
    );
  }

  if (clip.qa_status === "rejected") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
          bg-[var(--color-action-danger)] text-[var(--color-text-inverse)]"
        title={clip.qa_rejection_reason ?? undefined}
      >
        <X size={12} /> Rejected
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        size="sm"
        onClick={() => onApprove(clip.id)}
        loading={isApproving}
        disabled={isApproving || isRejecting}
        icon={<Check size={14} />}
      >
        Approve
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => onReject(clip.id)}
        loading={isRejecting}
        disabled={isApproving || isRejecting}
        icon={<X size={14} />}
      >
        Reject
      </Button>
    </div>
  );
}
