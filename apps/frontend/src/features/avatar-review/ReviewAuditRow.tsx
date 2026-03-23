import { UserPlus } from "@/tokens/icons";
import { REVIEW_ACTION_CONFIG } from "./types";
import type { ReviewAuditEntry } from "./types";
import { formatDateTime } from "@/lib/format";

interface ReviewAuditRowProps {
  entry: ReviewAuditEntry;
  showAvatarId?: boolean;
}

export function ReviewAuditRow({ entry, showAvatarId }: ReviewAuditRowProps) {
  const config = REVIEW_ACTION_CONFIG[entry.action] ?? {
    icon: UserPlus,
    label: entry.action,
    color: "text-cyan-400",
  };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 px-[var(--spacing-2)] py-1.5 font-mono text-xs rounded-[var(--radius-sm)] hover:bg-[#161b22] transition-colors">
      <Icon size={14} className={config.color} />
      <span className={config.color}>{config.label.toLowerCase()}</span>
      {showAvatarId && (
        <>
          <span className="text-[var(--color-text-muted)] opacity-30">|</span>
          <span className="text-[var(--color-text-muted)]">avatar #{entry.avatar_id}</span>
        </>
      )}
      <span className="text-[var(--color-text-muted)] opacity-30">|</span>
      <span className="text-[var(--color-text-muted)] opacity-60">{formatDateTime(entry.created_at)}</span>
      {entry.comment && (
        <>
          <span className="text-[var(--color-text-muted)] opacity-30">|</span>
          <span className="text-[var(--color-text-muted)] truncate">{entry.comment}</span>
        </>
      )}
    </div>
  );
}
