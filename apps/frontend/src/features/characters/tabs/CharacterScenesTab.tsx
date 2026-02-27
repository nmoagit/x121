/**
 * Placeholder for character scenes tab (PRD-112).
 *
 * Depends on scene management PRDs being implemented.
 */

import { EmptyState } from "@/components/domain";
import { Layers } from "@/tokens/icons";

export function CharacterScenesTab() {
  return (
    <EmptyState
      icon={<Layers size={32} />}
      title="Scenes"
      description="Scene assignment and generation will be available in a future update."
    />
  );
}
