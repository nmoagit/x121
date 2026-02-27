/**
 * Placeholder for character metadata tab (PRD-112).
 *
 * Will display and allow editing of character metadata key-value pairs.
 */

import { EmptyState } from "@/components/domain";
import { FileText } from "@/tokens/icons";

interface CharacterMetadataTabProps {
  characterId: number;
}

export function CharacterMetadataTab({ characterId: _characterId }: CharacterMetadataTabProps) {
  return (
    <EmptyState
      icon={<FileText size={32} />}
      title="Metadata"
      description="Character metadata editing will be available in a future update."
    />
  );
}
