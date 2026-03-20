/**
 * Main side-by-side comparison component for regenerated segments (PRD-101).
 *
 * Renders two synchronized video players (old vs new), diff overlay toggle,
 * QA score comparison, quick-action buttons, and a version filmstrip.
 */

import { useState } from "react";

import { Button ,  WireframeLoader } from "@/components/primitives";
import { ChevronLeft, ChevronRight, Pause, Play } from "@/tokens/icons";

import { ComparisonActions } from "./ComparisonActions";
import { DiffOverlayPanel, DiffOverlayToggle } from "./DiffOverlay";
import { QAScoreComparison } from "./QAScoreComparison";
import { VersionFilmstrip } from "./VersionFilmstrip";
import { useVersionComparison } from "./hooks/use-segment-versions";
import { useDualSync } from "./hooks/useDualSync";
import type { ComparisonDecision } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface RegenerationComparisonProps {
  segmentId: number;
  oldVersion: number;
  newVersion: number;
  onDecision?: (decision: ComparisonDecision) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RegenerationComparison({
  segmentId,
  oldVersion,
  newVersion,
  onDecision,
}: RegenerationComparisonProps) {
  const { data: comparison, isLoading } = useVersionComparison(segmentId, oldVersion, newVersion);
  const sync = useDualSync();
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [selectedV1, setSelectedV1] = useState(oldVersion);
  const [selectedV2, setSelectedV2] = useState(newVersion);

  if (isLoading) {
    return (
      <div
        data-testid="regeneration-comparison-loading"
        className="flex items-center justify-center py-12"
      >
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (!comparison) {
    return (
      <div
        data-testid="regeneration-comparison-empty"
        className="text-sm text-[var(--color-text-muted)] text-center py-12"
      >
        Comparison data unavailable
      </div>
    );
  }

  return (
    <div data-testid="regeneration-comparison" className="space-y-4">
      {/* Side-by-side video panels */}
      <div className="grid grid-cols-2 gap-[var(--spacing-4)]">
        {/* Old version */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
            Old (v{comparison.old_version.version_number})
          </h3>
          <div className="relative aspect-video rounded-[var(--radius-lg)] overflow-hidden bg-black">
            <video
              ref={sync.leftPlayer.videoRef}
              src={comparison.old_version.video_path}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* New version */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
              New (v{comparison.new_version.version_number})
            </h3>
            <DiffOverlayToggle
              enabled={diffEnabled}
              onToggle={() => setDiffEnabled((prev) => !prev)}
            />
          </div>
          <div className="relative aspect-video rounded-[var(--radius-lg)] overflow-hidden bg-black">
            <video
              ref={sync.rightPlayer.videoRef}
              src={comparison.new_version.video_path}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-contain"
            />
            <DiffOverlayPanel enabled={diffEnabled} />
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-[var(--spacing-2)]">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={16} />}
          onClick={sync.stepBackward}
          data-testid="step-backward"
        >
          Frame
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={sync.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          onClick={sync.togglePlay}
          data-testid="play-pause"
        >
          {sync.isPlaying ? "Pause" : "Play"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight size={16} />}
          onClick={sync.stepForward}
          data-testid="step-forward"
        >
          Frame
        </Button>
      </div>

      {/* QA scores */}
      <QAScoreComparison
        oldScores={comparison.old_version.qa_scores_json}
        newScores={comparison.new_version.qa_scores_json}
        scoreDiffs={comparison.score_diffs}
      />

      {/* Action buttons */}
      {onDecision && (
        <ComparisonActions
          segmentId={segmentId}
          newVersionId={comparison.new_version.id}
          oldVersionId={comparison.old_version.id}
          onDecision={onDecision}
        />
      )}

      {/* Version filmstrip */}
      <VersionFilmstrip
        segmentId={segmentId}
        selectedV1={selectedV1}
        selectedV2={selectedV2}
        onSelectPair={(v1, v2) => {
          setSelectedV1(v1);
          setSelectedV2(v2);
        }}
      />
    </div>
  );
}
