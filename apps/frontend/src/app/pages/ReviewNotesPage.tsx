/**
 * Review Notes page — project/avatar/scene picker wrapping
 * note timeline for a specific segment.
 *
 * Flow: Project -> Avatar -> Scene -> Segment ID (typed) -> NoteTimeline
 */

import { ProjectAvatarPicker, ScenePicker, SegmentIdPicker } from "@/components/domain";
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
    <ProjectAvatarPicker
      title="Review Notes"
      description="Collaborative review notes for segment-level feedback."
    >
      {(_projectId, avatarId) => (
        <ScenePicker
          avatarId={avatarId}
          emptyIcon={<FileText size={32} />}
          noScenesDescription="This model has no scenes yet."
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
    </ProjectAvatarPicker>
  );
}
