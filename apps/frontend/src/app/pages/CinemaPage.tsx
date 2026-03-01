/**
 * Cinema Mode page — project/character/scene picker wrapping
 * the cinema mode full-screen player.
 *
 * Flow: Project -> Character -> Scene -> Segment ID (typed) -> CinemaMode
 */

import { useState } from "react";

import { ProjectCharacterPicker, ScenePicker, SegmentIdPicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Play } from "@/tokens/icons";

import { CinemaMode } from "@/features/cinema";

function SegmentCinema({ segmentId }: { segmentId: number }) {
  const [active, setActive] = useState(false);

  if (active) {
    return (
      <CinemaMode
        segmentId={segmentId}
        onExit={() => setActive(false)}
        onApprove={() => {
          /* approve handled by review feature */
        }}
        onReject={() => {
          /* reject handled by review feature */
        }}
        onFlag={() => {
          /* flag handled by review feature */
        }}
      />
    );
  }

  return (
    <Stack gap={4}>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-primary)]">
          Segment #{segmentId}
        </p>
        <button
          type="button"
          onClick={() => setActive(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Play size={16} />
          Enter Cinema Mode
        </button>
      </div>
    </Stack>
  );
}

export function CinemaPage() {
  return (
    <ProjectCharacterPicker
      title="Cinema Mode"
      description="Full-screen cinema review with ambilight and keyboard controls."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Play size={32} />}
          noScenesDescription="This character has no scenes yet."
        >
          {(_sceneId) => (
            <SegmentIdPicker
              emptyIcon={<Play size={32} />}
              emptyDescription="Type a segment ID above to enter cinema review mode."
            >
              {(segmentId) => <SegmentCinema segmentId={segmentId} />}
            </SegmentIdPicker>
          )}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}
