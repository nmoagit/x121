/**
 * Review Notes page — project/character/scene picker wrapping
 * note timeline for a specific segment.
 *
 * Flow: Project -> Character -> Scene -> Segment ID (typed) -> NoteTimeline
 */

import { ProjectCharacterPicker, ScenePicker, SegmentIdPicker } from "@/components/domain";
import { LoadingPane } from "@/components/primitives";
import { FileText } from "@/tokens/icons";

import {
  NoteTimeline,
  useReviewNotes,
  useReviewTags,
} from "@/features/review-notes";

function SegmentReviewNotes({ segmentId }: { segmentId: number }) {
  const { data: notes, isLoading } = useReviewNotes(segmentId);
  const { data: tags } = useReviewTags();

  if (isLoading) {
    return <LoadingPane />;
  }

  return <NoteTimeline notes={notes ?? []} tags={tags ?? []} />;
}

export function ReviewNotesPage() {
  return (
    <ProjectCharacterPicker
      title="Review Notes"
      description="Collaborative review notes for segment-level feedback."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<FileText size={32} />}
          noScenesDescription="This character has no scenes yet."
        >
          {(_sceneId) => (
            <SegmentIdPicker
              emptyIcon={<FileText size={32} />}
              emptyDescription="Type a segment ID above to view and create review notes."
            >
              {(segmentId) => <SegmentReviewNotes segmentId={segmentId} />}
            </SegmentIdPicker>
          )}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}
