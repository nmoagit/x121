/**
 * Placeholder for character assets tab (PRD-112).
 *
 * Depends on asset management PRDs being implemented.
 */

import { EmptyState } from "@/components/domain";
import { File } from "@/tokens/icons";

export function CharacterAssetsTab() {
  return (
    <EmptyState
      icon={<File size={32} />}
      title="Assets"
      description="Generated assets and deliverables will be available in a future update."
    />
  );
}
