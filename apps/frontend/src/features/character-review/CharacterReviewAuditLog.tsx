import { TerminalSection } from "@/components/domain";
import { WireframeLoader } from "@/components/primitives";
import { useCharacterReviewHistory } from "./hooks/use-character-review";
import { ReviewAuditRow } from "./ReviewAuditRow";
import type { ReviewAuditEntry } from "./types";

interface CharacterReviewAuditLogProps {
  characterId: number;
}

export function CharacterReviewAuditLog({ characterId }: CharacterReviewAuditLogProps) {
  const { data, isPending, isError } = useCharacterReviewHistory(characterId);

  if (isPending) return <div className="m-4"><WireframeLoader size={48} /></div>;
  if (isError) return <div className="p-4 text-xs font-mono text-red-400">Failed to load review history.</div>;

  const entries: ReviewAuditEntry[] = data ?? [];

  if (entries.length === 0) {
    return (
      <TerminalSection title="Review History">
        <p className="text-xs font-mono text-[var(--color-text-muted)]">No review history yet.</p>
      </TerminalSection>
    );
  }

  return (
    <TerminalSection title={`Review History (${entries.length})`}>
      <div className="flex flex-col gap-px">
        {entries.map((entry) => (
          <ReviewAuditRow key={entry.id} entry={entry} />
        ))}
      </div>
    </TerminalSection>
  );
}
