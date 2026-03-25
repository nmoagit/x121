import { useState } from "react";
import { Button ,  ContextLoader } from "@/components/primitives";
import { Modal } from "@/components/composite";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import {
  useReviewerWorkload,
  useProjectAssignments,
  useAutoAllocate,
} from "./hooks/use-avatar-review";
import type { ReviewerWorkload, AutoAllocatePreview, ProposedAssignment } from "./types";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { formatDate } from "@/lib/format";

interface AssignmentDashboardProps {
  projectId: number;
}

export function AssignmentDashboard({ projectId }: AssignmentDashboardProps) {
  useSetPageTitle("Review Assignments", "Manage reviewer assignments and workload distribution.");
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

  if (workloadPending) return <div className="m-6"><ContextLoader size={48} /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" onClick={handlePreview} disabled={autoAllocate.isPending}>
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
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Reviewer Workload</span>
      </div>
      <div className={TERMINAL_BODY}>
        {workload.length === 0 ? (
          <div className="font-mono text-xs text-[var(--color-text-muted)]">No reviewers found.</div>
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
                <div key={w.reviewer_user_id} className="bg-[#161b22] rounded-[var(--radius-md)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-medium text-[var(--color-text-primary)]">
                      {w.reviewer_username}
                    </span>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--color-text-muted)]">
                      <span>Assigned: <span className="text-cyan-400">{w.assigned_count}</span></span>
                      <span className="opacity-30">|</span>
                      <span>Review: <span className="text-orange-400">{w.in_review_count}</span></span>
                      <span className="opacity-30">|</span>
                      <span>Done: <span className="text-green-400">{w.completed_count}</span></span>
                      <span className="opacity-30">|</span>
                      <span>Approval: <span className="text-green-400">{approvalRate}%</span></span>
                    </div>
                  </div>
                  <div className="w-full bg-[#0d1117] rounded-full h-1.5">
                    <div
                      className="bg-cyan-400 rounded-full h-1.5 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

import type { AvatarReviewAssignment } from "./types";

function AssignmentsTable({ assignments }: { assignments: AvatarReviewAssignment[] }) {
  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>
          Assignments ({assignments.length})
        </span>
      </div>
      {assignments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className={TERMINAL_DIVIDER}>
                <th className={`${TERMINAL_TH} py-2 px-3`}>ID</th>
                <th className={`${TERMINAL_TH} py-2 px-3`}>Avatar</th>
                <th className={`${TERMINAL_TH} py-2 px-3`}>Reviewer</th>
                <th className={`${TERMINAL_TH} py-2 px-3`}>Round</th>
                <th className={`${TERMINAL_TH} py-2 px-3`}>Status</th>
                <th className={`${TERMINAL_TH} py-2 px-3`}>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{a.id}</td>
                  <td className="py-2 px-3 text-cyan-400">{a.avatar_id}</td>
                  <td className="py-2 px-3 text-[var(--color-text-primary)]">{a.reviewer_user_id}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{a.review_round}</td>
                  <td className={`py-2 px-3 uppercase tracking-wide ${TERMINAL_STATUS_COLORS[a.status] ?? "text-[var(--color-text-primary)]"}`}>{a.status}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">
                    {formatDate(a.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={TERMINAL_BODY}>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">No assignments yet.</span>
        </div>
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
      <p className="font-mono text-xs text-[var(--color-text-muted)]">
        {preview.unassigned_count} unassigned avatar
        {preview.unassigned_count !== 1 ? "s" : ""} will be distributed across{" "}
        {preview.reviewer_count} reviewer
        {preview.reviewer_count !== 1 ? "s" : ""}:
      </p>
      {preview.proposed_assignments.length === 0 ? (
        <p className="font-mono text-xs text-[var(--color-text-muted)]">No avatars to allocate.</p>
      ) : (
        <div className="space-y-1">
          {preview.proposed_assignments.map((pa: ProposedAssignment, idx: number) => (
            <div key={idx} className="flex justify-between font-mono text-xs py-1 hover:bg-[#161b22] px-2 rounded">
              <span className="text-[var(--color-text-primary)]">{pa.avatar_name}</span>
              <span className="text-cyan-400">&rarr; {pa.reviewer_username}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          disabled={isPending || preview.proposed_assignments.length === 0}
        >
          Confirm Allocation
        </Button>
      </div>
    </div>
  );
}
