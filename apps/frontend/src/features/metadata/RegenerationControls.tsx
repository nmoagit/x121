/**
 * Regeneration Controls (PRD-13).
 *
 * UI controls for triggering single-character or project-wide metadata
 * regeneration. Supports a "stale only" option for project-level batches.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useRegenerateCharacterMetadata,
  useRegenerateProjectMetadata,
} from "./hooks/use-metadata";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface RegenerationControlsProps {
  /** Regenerate for a single character. */
  characterId?: number;
  /** Regenerate for all characters in a project. */
  projectId?: number;
  /** Called after a successful regeneration to allow parent refresh. */
  onRegenerated?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RegenerationControls({
  characterId,
  projectId,
  onRegenerated,
}: RegenerationControlsProps) {
  const [staleOnly, setStaleOnly] = useState(false);
  const characterMutation = useRegenerateCharacterMetadata();
  const projectMutation = useRegenerateProjectMetadata();

  const isRegenerating =
    characterMutation.isPending || projectMutation.isPending;

  const handleRegenerate = async () => {
    if (characterId) {
      await characterMutation.mutateAsync(characterId);
    } else if (projectId) {
      await projectMutation.mutateAsync({
        projectId,
        options: { stale_only: staleOnly },
      });
    }
    onRegenerated?.();
  };

  return (
    <Stack gap={3}>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={isRegenerating}
          onClick={handleRegenerate}
        >
          {isRegenerating
            ? "Regenerating..."
            : characterId
              ? "Regenerate Character Metadata"
              : "Regenerate Project Metadata"}
        </Button>

        {/* Stale-only toggle (project-level only) */}
        {projectId && !characterId && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
              className="rounded border-[var(--color-border-default)]"
            />
            Stale only
          </label>
        )}
      </div>

      {/* Show the latest result report for project-level regeneration */}
      {projectMutation.data && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Regenerated: {projectMutation.data.regenerated}, Skipped:{" "}
          {projectMutation.data.skipped}, Failed:{" "}
          {projectMutation.data.failed}
        </p>
      )}
    </Stack>
  );
}
