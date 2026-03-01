/**
 * Annotations page — project/character/scene picker wrapping
 * annotation components for a selected segment.
 *
 * Flow: Project -> Character -> Scene -> Segment ID (typed) ->
 *       AnnotationSummary + DrawingCanvas
 */

import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { ProjectCharacterPicker, ScenePicker, SegmentIdPicker } from "@/components/domain";
import { Edit3 } from "@/tokens/icons";

import {
  AnnotationSummary,
  DrawingCanvas,
  useAnnotations,
} from "@/features/annotations";

function SegmentAnnotations({ segmentId }: { segmentId: number }) {
  const { data: annotations, isLoading } = useAnnotations(segmentId);

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={6}>
      <DrawingCanvas width={640} height={360} editable />
      <AnnotationSummary annotations={annotations ?? []} />
    </Stack>
  );
}

export function AnnotationsPage() {
  return (
    <ProjectCharacterPicker
      title="Annotations"
      description="View and create frame annotations on scene segments."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Edit3 size={32} />}
          noScenesDescription="This character has no scenes yet."
        >
          {(_sceneId) => (
            <SegmentIdPicker
              emptyIcon={<Edit3 size={32} />}
              emptyDescription="Type a segment ID above to view and create frame annotations."
            >
              {(segmentId) => <SegmentAnnotations segmentId={segmentId} />}
            </SegmentIdPicker>
          )}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}
