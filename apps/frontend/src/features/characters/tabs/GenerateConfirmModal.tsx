/**
 * Confirmation modal shown before generating videos.
 *
 * When some of the target scenes already have video content, the modal
 * warns the user and provides per-scene toggles to force regeneration.
 * Scenes without existing video are always included.
 */

import { useEffect } from "react";

import { Modal } from "@/components/composite/Modal";
import { Stack } from "@/components/layout";
import { Badge, Button, Toggle } from "@/components/primitives";
import { useSetToggle } from "@/hooks/useSetToggle";
import { AlertCircle, Play } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface GenerateCandidate {
  sceneId: number;
  sceneName: string;
  trackName: string | null;
  hasVideo: boolean;
}

interface GenerateConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** All scenes that would be generated. */
  candidates: GenerateCandidate[];
  onConfirm: (sceneIds: number[]) => void;
  loading?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerateConfirmModal({
  open,
  onClose,
  candidates,
  onConfirm,
  loading,
}: GenerateConfirmModalProps) {
  const withVideo = candidates.filter((c) => c.hasVideo);
  const withoutVideo = candidates.filter((c) => !c.hasVideo);

  // Per-scene override toggles (only for scenes that already have video)
  const [overrides, toggleOverride, setOverrides] = useSetToggle<number>();

  // Reset overrides when candidates change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset when prop identity changes
  useEffect(() => {
    setOverrides(new Set());
  }, [candidates]);

  // If there are no scenes with existing video, skip the modal entirely
  // (caller should check this and call onConfirm directly)

  const confirmIds = [...withoutVideo.map((c) => c.sceneId), ...[...overrides]];

  function handleConfirm() {
    onConfirm(confirmIds);
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirm Generation" size="lg">
      <Stack gap={4}>
        {/* Summary */}
        <p className="text-sm text-[var(--color-text-secondary)]">
          {withoutVideo.length} scene{withoutVideo.length !== 1 ? "s" : ""} will be generated.
          {withVideo.length > 0 && (
            <>
              {" "}
              <span className="text-[var(--color-text-warning)] font-medium">
                {withVideo.length} scene{withVideo.length !== 1 ? "s" : ""} already{" "}
                {withVideo.length === 1 ? "has" : "have"} video.
              </span>
            </>
          )}
        </p>

        {/* Existing video warnings with toggles */}
        {withVideo.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-warning)] bg-[var(--color-surface-warning)]">
            <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-warning)]">
              <div className="flex items-center gap-[var(--spacing-2)]">
                <AlertCircle size={14} className="text-[var(--color-text-warning)] shrink-0" />
                <span className="text-xs font-medium text-[var(--color-text-warning)]">
                  Toggle to regenerate and override existing video
                </span>
              </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {withVideo.map((c) => (
                <div
                  key={c.sceneId}
                  className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] border-b last:border-b-0 border-[var(--color-border-warning)]"
                >
                  <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
                    <span className="text-sm text-[var(--color-text-primary)] truncate">
                      {c.sceneName}
                    </span>
                    {c.trackName && (
                      <Badge variant="default" size="sm">
                        {c.trackName}
                      </Badge>
                    )}
                  </div>
                  <Toggle
                    checked={overrides.has(c.sceneId)}
                    onChange={() => toggleOverride(c.sceneId)}
                    label="Override"
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">
            {confirmIds.length} scene{confirmIds.length !== 1 ? "s" : ""} will be generated
            {overrides.size > 0 &&
              ` (${overrides.size} override${overrides.size !== 1 ? "s" : ""})`}
          </span>
          <div className="flex gap-[var(--spacing-2)]">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirmIds.length === 0}
              loading={loading}
              icon={<Play size={14} />}
            >
              Generate {confirmIds.length}
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
