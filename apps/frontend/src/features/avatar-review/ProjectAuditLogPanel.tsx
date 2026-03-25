import { useState } from "react";
import { Button ,  ContextLoader } from "@/components/primitives";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";
import { useProjectAuditLog, useExportAuditLog } from "./hooks/use-avatar-review";
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
    <div className={TERMINAL_PANEL}>
      <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
        <span className={TERMINAL_HEADER_TITLE}>Audit Log</span>
        <Button
          size="xs"
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() => exportAuditLog(filters)}
        >
          Export CSV
        </Button>
      </div>

      <div className={TERMINAL_BODY}>
        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <select
            className={TERMINAL_SELECT}
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
          <ContextLoader size={48} />
        ) : entries.length === 0 ? (
          <div className="font-mono text-xs text-[var(--color-text-muted)]">No audit entries found.</div>
        ) : (
          <div className="space-y-0">
            {entries.map((entry) => (
              <ReviewAuditRow key={entry.id} entry={entry} showAvatarId />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
