import { useState } from "react";
import { Button, Spinner } from "@/components/primitives";
import { Modal } from "@/components/composite";
import {
  useReviewerWorkload,
  useProjectAssignments,
  useAutoAllocate,
} from "./hooks/use-character-review";
import type { ReviewerWorkload, AutoAllocatePreview, ProposedAssignment } from "./types";
import { formatDate } from "@/lib/format";

interface AssignmentDashboardProps {
  projectId: number;
}

export function AssignmentDashboard({ projectId }: AssignmentDashboardProps) {
  const { data: workloadData, isPending: workloadPending } = useReviewerWorkload(projectId);
  const { data: assignmentData } = useProjectAssignments(projectId);
  const autoAllocate = useAutoAllocate(projectId);
  const [showAllocatePreview, setShowAllocatePreview] = useState(false);
  const [preview, setPreview] = useState<AutoAllocatePreview | null>(null);

  const workload: ReviewerWorkload[] = workloadData ?? [];

  const handlePreview = async () => {
    const result = await autoAllocate.mutateAsync({ preview: true });
    setPreview(result as AutoAllocatePreview);
    setShowAllocatePreview(true);
  };

  const handleConfirmAllocate = () => {
    autoAllocate.mutate(
      { preview: false },
      {
        onSuccess: () => {
          setShowAllocatePreview(false);
          setPreview(null);
        },
      },
    );
  };

  if (workloadPending) return <div className="m-6"><Spinner /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Review Assignments</h1>
        <Button variant="primary" onClick={handlePreview} disabled={autoAllocate.isPending}>
          Auto-Allocate
        </Button>
      </div>

      <WorkloadSection workload={workload} />
      <AssignmentsTable assignments={assignmentData ?? []} />

      <Modal
        open={showAllocatePreview && preview !== null}
        title="Auto-Allocate Preview"
        onClose={() => setShowAllocatePreview(false)}
      >
        {preview && (
          <AllocatePreviewContent
            preview={preview}
            onCancel={() => setShowAllocatePreview(false)}
            onConfirm={handleConfirmAllocate}
            isPending={autoAllocate.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WorkloadSection({ workload }: { workload: ReviewerWorkload[] }) {
  const maxCount = Math.max(
    ...workload.map((w) => w.assigned_count + w.in_review_count + w.completed_count),
    1,
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
        Reviewer Workload
      </h2>
      {workload.length === 0 ? (
        <div className="text-text-muted text-sm">No reviewers found.</div>
      ) : (
        <div className="space-y-2">
          {workload.map((w) => {
            const total = w.assigned_count + w.in_review_count + w.completed_count;
            const pct = (total / maxCount) * 100;
            const approvalRate =
              w.completed_count > 0
                ? Math.round((w.approved_count / w.completed_count) * 100)
                : 0;

            return (
              <div key={w.reviewer_user_id} className="bg-surface-secondary rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary">
                    {w.reviewer_username}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>Assigned: {w.assigned_count}</span>
                    <span>In Review: {w.in_review_count}</span>
                    <span>Done: {w.completed_count}</span>
                    <span>Approval: {approvalRate}%</span>
                  </div>
                </div>
                <div className="w-full bg-surface-primary rounded-full h-2">
                  <div
                    className="bg-action-primary rounded-full h-2 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

import type { CharacterReviewAssignment } from "./types";

function AssignmentsTable({ assignments }: { assignments: CharacterReviewAssignment[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
        Assignments ({assignments.length})
      </h2>
      {assignments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-primary">
                <th className="py-2 px-3">ID</th>
                <th className="py-2 px-3">Character</th>
                <th className="py-2 px-3">Reviewer</th>
                <th className="py-2 px-3">Round</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-border-primary">
                  <td className="py-2 px-3 text-text-muted">{a.id}</td>
                  <td className="py-2 px-3 text-text-primary">{a.character_id}</td>
                  <td className="py-2 px-3 text-text-primary">{a.reviewer_user_id}</td>
                  <td className="py-2 px-3 text-text-muted">{a.review_round}</td>
                  <td className="py-2 px-3 text-text-primary capitalize">{a.status}</td>
                  <td className="py-2 px-3 text-text-muted">
                    {formatDate(a.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-text-muted text-sm">No assignments yet.</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface AllocatePreviewContentProps {
  preview: AutoAllocatePreview;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function AllocatePreviewContent({ preview, onCancel, onConfirm, isPending }: AllocatePreviewContentProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {preview.unassigned_count} unassigned character
        {preview.unassigned_count !== 1 ? "s" : ""} will be distributed across{" "}
        {preview.reviewer_count} reviewer
        {preview.reviewer_count !== 1 ? "s" : ""}:
      </p>
      {preview.proposed_assignments.length === 0 ? (
        <p className="text-sm text-text-muted">No characters to allocate.</p>
      ) : (
        <div className="space-y-1">
          {preview.proposed_assignments.map((pa: ProposedAssignment, idx: number) => (
            <div key={idx} className="flex justify-between text-sm py-1">
              <span className="text-text-primary">{pa.character_name}</span>
              <span className="text-text-muted">&rarr; {pa.reviewer_username}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={isPending || preview.proposed_assignments.length === 0}
        >
          Confirm Allocation
        </Button>
      </div>
    </div>
  );
}
