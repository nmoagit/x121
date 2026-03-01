/**
 * Images content page — project/character picker wrapping
 * the image variant gallery and upload components.
 */

import { ProjectCharacterPicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { VariantGallery } from "@/features/images/VariantGallery";
import { SourceImageUpload } from "@/features/images/SourceImageUpload";

export function ImagesPage() {
  return (
    <ProjectCharacterPicker
      title="Images"
      description="Manage source images and variants for a character."
    >
      {(_projectId, characterId) => (
        <Stack gap={6}>
          <SourceImageUpload
            characterId={characterId}
            onUploaded={() => {
              /* variant gallery auto-refreshes via query invalidation */
            }}
          />
          <VariantGallery characterId={characterId} />
        </Stack>
      )}
    </ProjectCharacterPicker>
  );
}
