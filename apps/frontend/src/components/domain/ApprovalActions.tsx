/**
 * Shared approval action buttons used across image variants, scene clips,
 * and metadata versions.
 *
 * Shows contextual approve/unapprove/reject buttons based on the current
 * approval state. Uses icon-only buttons with tooltips for a compact layout.
 */

import { Badge, Button } from "@/components/primitives";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Check, Download, RotateCcw, Trash2, XCircle } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

type ApprovalStatus = "pending" | "approved" | "rejected";

const STATUS_BADGE_VARIANT: Record<ApprovalStatus, "default" | "success" | "danger"> = {
  pending: "default",
  approved: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

interface ApprovalActionsProps {
  /** Current approval status — renders a colored badge when provided. */
  status?: ApprovalStatus;
  /** Whether the approve button should be shown. */
  canApprove: boolean;
  /** Whether the unapprove (revert to pending) button should be shown. */
  canUnapprove: boolean;
  /** Called when the approve button is clicked. */
  onApprove: () => void;
  /** Called when the unapprove button is clicked. */
  onUnapprove: () => void;
  /** Called when the reject button is clicked. */
  onReject: () => void;
  /** Whether the approve mutation is in progress. */
  isApproving?: boolean;
  /** Whether the unapprove mutation is in progress. */
  isUnapproving?: boolean;
  /** Whether the reject mutation is in progress. */
  isRejecting?: boolean;
  /** Optional export/download handler — shows a ghost export button when provided. */
  onExport?: () => void;
  /** Optional delete handler — shows a danger delete button when provided. */
  onDelete?: () => void;
  /** Whether the delete mutation is in progress. */
  isDeleting?: boolean;
  /** Whether the delete button should be disabled (e.g. final clips). */
  isDeleteDisabled?: boolean;
  /** Show text labels alongside icons (default: false — icon-only with tooltips). */
  showLabels?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ApprovalActions({
  status,
  canApprove,
  canUnapprove,
  onApprove,
  onUnapprove,
  onReject,
  isApproving,
  isUnapproving,
  isRejecting,
  onExport,
  onDelete,
  isDeleting,
  isDeleteDisabled,
  showLabels = false,
}: ApprovalActionsProps) {
  const anyLoading = isApproving || isUnapproving || isRejecting || isDeleting;

  if (!canApprove && !canUnapprove && !onDelete && !onExport && !status) return null;

  return (
    <div className="flex items-center gap-1">
      {/* Status badge */}
      {status && (
        <Badge variant={STATUS_BADGE_VARIANT[status]} size="sm">
          {STATUS_LABEL[status]}
        </Badge>
      )}

      {/* Approve */}
      {canApprove && (
        <Tooltip content="Approve">
          <Button
            size="sm"
            variant="primary"
            icon={<Check size={14} />}
            onClick={onApprove}
            loading={isApproving}
            disabled={anyLoading}
            aria-label="Approve"
          >
            {showLabels ? "Approve" : undefined}
          </Button>
        </Tooltip>
      )}

      {/* Reject */}
      {canApprove && (
        <Tooltip content="Reject">
          <Button
            size="sm"
            variant="secondary"
            icon={<XCircle size={14} />}
            onClick={onReject}
            loading={isRejecting}
            disabled={anyLoading}
            aria-label="Reject"
          >
            {showLabels ? "Reject" : undefined}
          </Button>
        </Tooltip>
      )}

      {/* Unapprove */}
      {canUnapprove && (
        <Tooltip content="Revert to pending">
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={14} />}
            onClick={onUnapprove}
            loading={isUnapproving}
            disabled={anyLoading}
            aria-label="Unapprove"
          >
            {showLabels ? "Unapprove" : undefined}
          </Button>
        </Tooltip>
      )}

      {/* Export */}
      {onExport && (
        <Tooltip content="Export">
          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={14} />}
            onClick={onExport}
            disabled={anyLoading}
            aria-label="Export"
          >
            {showLabels ? "Export" : undefined}
          </Button>
        </Tooltip>
      )}

      {/* Delete */}
      {onDelete && (
        <Tooltip content="Delete">
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={onDelete}
            loading={isDeleting}
            disabled={anyLoading || isDeleteDisabled}
            aria-label="Delete"
          >
            {showLabels ? "Delete" : undefined}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
