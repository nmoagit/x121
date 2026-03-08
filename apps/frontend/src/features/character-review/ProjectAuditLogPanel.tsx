import { useState } from "react";
import { Button, Spinner } from "@/components/primitives";
import { useProjectAuditLog, useExportAuditLog } from "./hooks/use-character-review";
import type { AuditLogFilters, ReviewAuditEntry } from "./types";
import {
  CheckCircle,
  XCircle,
  UserPlus,
  Play,
  RefreshCw,
  ArrowRightLeft,
  Download,
} from "@/tokens/icons";

const ACTION_CONFIG: Record<
  string,
  { icon: typeof CheckCircle; label: string; color: string }
> = {
  assigned: { icon: UserPlus, label: "Assigned", color: "text-blue-400" },
  reassigned: { icon: ArrowRightLeft, label: "Reassigned", color: "text-yellow-400" },
  review_started: { icon: Play, label: "Review Started", color: "text-yellow-400" },
  approved: { icon: CheckCircle, label: "Approved", color: "text-green-400" },
  rejected: { icon: XCircle, label: "Rejected", color: "text-red-400" },
  rework_submitted: { icon: RefreshCw, label: "Submitted for Re-review", color: "text-blue-400" },
  re_queued: { icon: RefreshCw, label: "Re-queued", color: "text-blue-400" },
};

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
            <AuditLogRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogRow({ entry }: { entry: ReviewAuditEntry }) {
  const config = ACTION_CONFIG[entry.action] ?? { icon: UserPlus, label: entry.action, color: "text-blue-400" };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 py-3 border-b border-border-primary last:border-b-0">
      <div className={`mt-0.5 ${config.color}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{config.label}</span>
          <span className="text-xs text-text-muted">Character #{entry.character_id}</span>
          <span className="text-xs text-text-muted">
            {new Date(entry.created_at).toLocaleString()}
          </span>
        </div>
        {entry.comment && (
          <p className="text-sm text-text-muted mt-1">{entry.comment}</p>
        )}
      </div>
    </div>
  );
}
