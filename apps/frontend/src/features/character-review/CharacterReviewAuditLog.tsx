import { Spinner } from "@/components/primitives";
import { useCharacterReviewHistory } from "./hooks/use-character-review";
import { ReviewAuditRow } from "./ReviewAuditRow";
import type { ReviewAuditEntry } from "./types";

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
        <ReviewAuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
