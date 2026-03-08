import { useState } from "react";
import { Button, Spinner } from "@/components/primitives";
import { useProjectAuditLog, useExportAuditLog } from "./hooks/use-character-review";
import { ReviewAuditRow } from "./ReviewAuditRow";
import type { AuditLogFilters, ReviewAuditEntry } from "./types";
import { Download } from "@/tokens/icons";

interface ProjectAuditLogPanelProps {
  projectId: number;
}

export function ProjectAuditLogPanel({ projectId }: ProjectAuditLogPanelProps) {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const { data, isPending } = useProjectAuditLog(projectId, filters);
  const exportAuditLog = useExportAuditLog(projectId);

  const entries: ReviewAuditEntry[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
          Audit Log
        </h2>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() => exportAuditLog(filters)}
        >
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          className="bg-surface-secondary text-text-primary text-sm rounded px-2 py-1 border border-border-primary"
          value={filters.action ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, action: e.target.value || undefined }))
          }
        >
          <option value="">All Actions</option>
          <option value="assigned">Assigned</option>
          <option value="reassigned">Reassigned</option>
          <option value="review_started">Review Started</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="rework_submitted">Rework Submitted</option>
          <option value="re_queued">Re-queued</option>
        </select>
      </div>

      {isPending ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <div className="text-text-muted text-sm">No audit entries found.</div>
      ) : (
        <div className="space-y-0">
          {entries.map((entry) => (
            <ReviewAuditRow key={entry.id} entry={entry} showCharacterId />
          ))}
        </div>
      )}
    </div>
  );
}
