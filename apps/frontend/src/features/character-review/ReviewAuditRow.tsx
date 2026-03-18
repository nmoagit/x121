import { UserPlus } from "@/tokens/icons";
import { REVIEW_ACTION_CONFIG } from "./types";
import type { ReviewAuditEntry } from "./types";
import { formatDateTime } from "@/lib/format";

interface ReviewAuditRowProps {
  entry: ReviewAuditEntry;
  showCharacterId?: boolean;
}

export function ReviewAuditRow({ entry, showCharacterId }: ReviewAuditRowProps) {
  const config = REVIEW_ACTION_CONFIG[entry.action] ?? {
    icon: UserPlus,
    label: entry.action,
    color: "text-blue-400",
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 py-3 border-b border-border-primary last:border-b-0">
      <div className={`mt-0.5 ${config.color}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{config.label}</span>
          {showCharacterId && (
            <span className="text-xs text-text-muted">Model #{entry.character_id}</span>
          )}
          <span className="text-xs text-text-muted">{formatDateTime(entry.created_at)}</span>
        </div>
        {entry.comment && <p className="text-sm text-text-muted mt-1">{entry.comment}</p>}
      </div>
    </div>
  );
}
