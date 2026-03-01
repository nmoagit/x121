/**
 * Character images tab — source image upload + variant gallery (PRD-112).
 */

import { Stack } from "@/components/layout";

import { SourceImageUpload } from "@/features/images/SourceImageUpload";
import { VariantGallery } from "@/features/images/VariantGallery";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterImagesTabProps {
  characterId: number;
}

export function CharacterImagesTab({ characterId }: CharacterImagesTabProps) {
  return (
    <Stack gap={6}>
      <SourceImageUpload characterId={characterId} onUploaded={() => {}} />
      <VariantGallery characterId={characterId} />
    </Stack>
  );
}
