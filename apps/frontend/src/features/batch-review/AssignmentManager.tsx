/**
 * Manage review assignments for a project (PRD-92).
 *
 * Lists current assignments with status, reviewer, deadline, and filter
 * criteria. Supports creating new assignments and deleting existing ones.
 */

import { useCallback, useState } from "react";

import { Badge, Button, Input, Spinner } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { Plus, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatDateTime } from "@/lib/format";

import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
} from "./hooks/use-batch-review";
import { DeadlineTracker } from "./DeadlineTracker";
import {
  ASSIGNMENT_STATUS_BADGE_VARIANT,
  ASSIGNMENT_STATUS_LABELS,
} from "./types";
import type { ReviewAssignment } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AssignmentManagerProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AssignmentManager({ projectId }: AssignmentManagerProps) {
  const { data: assignments, isPending, isError } = useAssignments(projectId);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Spinner size="sm" />
        <span className="text-sm text-[var(--color-text-muted)]">Loading assignments...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-[var(--color-status-error)] py-4">
        Failed to load assignments
      </div>
    );
  }

  return (
    <div data-testid="assignment-manager" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Review Assignments
          </h3>
        </CardHeader>
        <CardBody>
          {assignments && assignments.length > 0 ? (
            <AssignmentList assignments={assignments} />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">No assignments yet.</p>
          )}
        </CardBody>
      </Card>

      <CreateAssignmentForm projectId={projectId} />

      {assignments && assignments.length > 0 && (
        <DeadlineTracker assignments={assignments} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Assignment list
   -------------------------------------------------------------------------- */

function AssignmentList({ assignments }: { assignments: ReviewAssignment[] }) {
  const deleteAssignment = useDeleteAssignment();

  const handleDelete = useCallback(
    (id: number) => {
      deleteAssignment.mutate(id);
    },
    [deleteAssignment],
  );

  return (
    <ul className="flex flex-col gap-2">
      {assignments.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-default)] px-3 py-2"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Reviewer #{a.reviewer_user_id}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {a.deadline ? `Due: ${formatDateTime(a.deadline)}` : "No deadline"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={ASSIGNMENT_STATUS_BADGE_VARIANT[a.status]}
              size="sm"
            >
              {ASSIGNMENT_STATUS_LABELS[a.status]}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={() => handleDelete(a.id)}
              loading={deleteAssignment.isPending}
              aria-label={`Delete assignment ${a.id}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------------
   Create assignment form
   -------------------------------------------------------------------------- */

function CreateAssignmentForm({ projectId }: { projectId: number }) {
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [deadline, setDeadline] = useState("");

  const createAssignment = useCreateAssignment();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const userId = parseInt(reviewerUserId, 10);
      if (Number.isNaN(userId) || userId <= 0) return;

      createAssignment.mutate(
        {
          project_id: projectId,
          reviewer_user_id: userId,
          deadline: deadline || undefined,
        },
        {
          onSuccess: () => {
            setReviewerUserId("");
            setDeadline("");
          },
        },
      );
    },
    [projectId, reviewerUserId, deadline, createAssignment],
  );

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          New Assignment
        </h3>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            label="Reviewer User ID"
            type="number"
            value={reviewerUserId}
            onChange={(e) => setReviewerUserId(e.target.value)}
            placeholder="Enter user ID"
            min="1"
          />
          <Input
            label="Deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={iconSizes.sm} />}
            loading={createAssignment.isPending}
            disabled={!reviewerUserId}
            onClick={handleSubmit}
          >
            Create Assignment
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
