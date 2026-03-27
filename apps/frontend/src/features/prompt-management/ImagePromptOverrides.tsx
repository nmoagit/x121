/**
 * Image type prompt overrides — editable prompt_template + negative
 * for each enabled image type. Used at project, group, and avatar levels.
 */

import { useCallback, useEffect, useState } from "react";

import { CollapsibleSection } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { TERMINAL_LABEL, TERMINAL_TEXTAREA } from "@/lib/ui-classes";
import { Image } from "@/tokens/icons";

import { useImageTypes, useUpdateImageType } from "@/features/image-catalogue/hooks/use-image-catalogue";
import type { ImageType } from "@/features/image-catalogue/types";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImagePromptOverridesProps {
  /** Image type IDs that are enabled at this level. Omit to show all active. */
  enabledImageTypeIds?: Set<number>;
  isLoading?: boolean;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ImagePromptOverrides({ enabledImageTypeIds, isLoading: externalLoading }: ImagePromptOverridesProps) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: imageTypes, isLoading: loadingIT } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);

  if (loadingIT || externalLoading) return <LoadingPane />;

  const activeTypes = (imageTypes ?? []).filter((it) => {
    if (!it.is_active) return false;
    if (enabledImageTypeIds && enabledImageTypeIds.size > 0) return enabledImageTypeIds.has(it.id);
    return true;
  });

  if (!activeTypes.length) {
    return (
      <EmptyState
        title="No Image Types"
        description="Enable image types to configure prompt overrides."
        icon={<Image />}
      />
    );
  }

  return (
    <Stack gap={3}>
      {activeTypes.map((it) => {
        const srcTrack = tracks?.find((t) => t.id === it.source_track_id);
        const outTrack = tracks?.find((t) => t.id === it.output_track_id);
        const desc = srcTrack && outTrack ? `${srcTrack.name} → ${outTrack.name}` : undefined;

        return (
          <ImageTypePromptEditor key={it.id} imageType={it} description={desc} />
        );
      })}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Per-image-type prompt editor
   -------------------------------------------------------------------------- */

function ImageTypePromptEditor({ imageType, description }: { imageType: ImageType; description?: string }) {
  const updateMutation = useUpdateImageType(imageType.id);

  const [prompt, setPrompt] = useState(imageType.prompt_template ?? "");
  const [negPrompt, setNegPrompt] = useState(imageType.negative_prompt_template ?? "");

  // Reset when image type data changes
  useEffect(() => {
    setPrompt(imageType.prompt_template ?? "");
    setNegPrompt(imageType.negative_prompt_template ?? "");
  }, [imageType.prompt_template, imageType.negative_prompt_template]);

  const dirty =
    prompt !== (imageType.prompt_template ?? "") ||
    negPrompt !== (imageType.negative_prompt_template ?? "");

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      prompt_template: prompt.trim() || null,
      negative_prompt_template: negPrompt.trim() || null,
    });
  }, [updateMutation, prompt, negPrompt]);

  return (
    <CollapsibleSection
      card
      title={imageType.name}
      description={description}
      defaultOpen={false}
    >
      <Stack gap={3}>
        <div className="flex flex-col gap-1 border-l-2 border-l-green-500 pl-2">
          <label className={TERMINAL_LABEL}>Prompt Template</label>
          <textarea
            rows={3}
            className={TERMINAL_TEXTAREA}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Positive prompt for image generation"
          />
        </div>
        <div className="flex flex-col gap-1 border-l-2 border-l-red-500 pl-2">
          <label className={TERMINAL_LABEL}>Negative Prompt</label>
          <textarea
            rows={3}
            className={TERMINAL_TEXTAREA}
            value={negPrompt}
            onChange={(e) => setNegPrompt(e.target.value)}
            placeholder="Negative prompt"
          />
        </div>
        {dirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        )}
      </Stack>
    </CollapsibleSection>
  );
}
