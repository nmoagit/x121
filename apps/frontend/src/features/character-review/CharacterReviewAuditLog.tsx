import { Spinner } from "@/components/primitives";
import { useCharacterReviewHistory } from "./hooks/use-character-review";
import { CheckCircle, XCircle, UserPlus, Play, RefreshCw, ArrowRightLeft } from "@/tokens/icons";
import type { ReviewAuditEntry } from "./types";

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

interface CharacterReviewAuditLogProps {
  characterId: number;
}

export function CharacterReviewAuditLog({ characterId }: CharacterReviewAuditLogProps) {
  const { data, isPending, isError } = useCharacterReviewHistory(characterId);

  if (isPending) return <div className="m-4"><Spinner /></div>;
  if (isError) return <div className="p-4 text-action-danger">Failed to load review history.</div>;

  const entries: ReviewAuditEntry[] = data ?? [];

  if (entries.length === 0) {
    return <div className="p-4 text-text-muted">No review history yet.</div>;
  }

  return (
    <div className="space-y-0">
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function AuditRow({ entry }: { entry: ReviewAuditEntry }) {
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
