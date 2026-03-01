/**
 * Character dashboard content page — project/character picker
 * wrapping the CharacterDashboard feature component.
 */

import { ProjectCharacterPicker } from "@/components/domain";
import { CharacterDashboard } from "@/features/character-dashboard/CharacterDashboard";

export function CharacterDashboardPage() {
  return (
    <ProjectCharacterPicker
      title="Character Dashboard"
      description="View settings, generation history, and readiness status for a character."
    >
      {(_projectId, characterId) => (
        <CharacterDashboard characterId={characterId} />
      )}
    </ProjectCharacterPicker>
  );
}
