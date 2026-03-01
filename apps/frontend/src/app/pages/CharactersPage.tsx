/**
 * Characters content page — project/character picker that redirects
 * to the full character detail route.
 */

import { useNavigate } from "@tanstack/react-router";

import { ProjectCharacterPicker } from "@/components/domain";

export function CharactersPage() {
  const navigate = useNavigate();

  return (
    <ProjectCharacterPicker
      title="Characters"
      description="Select a project and character to view details, images, and settings."
      onCharacterSelect={(projectId, characterId) => {
        navigate({
          to: `/projects/${projectId}/characters/${characterId}`,
        });
      }}
    />
  );
}
