/**
 * Placeholder for character images tab (PRD-112).
 *
 * Depends on PRD-113 (Character Ingest Pipeline) for image management.
 */

import { EmptyState } from "@/components/domain";
import { Image } from "@/tokens/icons";

export function CharacterImagesTab() {
  return (
    <EmptyState
      icon={<Image size={32} />}
      title="Images"
      description="Character image management will be available once PRD-113 is implemented."
    />
  );
}
