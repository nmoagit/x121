/**
 * Test shot trigger button component (PRD-58).
 *
 * Primary action button that opens a dialog for entering test shot parameters
 * and triggers generation. Shows an inline loading state while generating.
 *
 * DRY-279: Uses the design system Modal instead of a hand-rolled overlay.
 */

import { useState } from "react";

import { Modal } from "@/components/composite";

import type { GenerateTestShotRequest } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TestShotButtonProps {
  /** Pre-filled scene type ID for the test shot. */
  sceneTypeId: number;
  /** Pre-filled character ID for the test shot. */
  characterId: number;
  /** Default seed image path. */
  defaultSeedImagePath?: string;
  /** Whether the generate mutation is pending. */
  isLoading?: boolean;
  /** Callback to generate the test shot. */
  onGenerate: (request: GenerateTestShotRequest) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TestShotButton({
  sceneTypeId,
  characterId,
  defaultSeedImagePath = "",
  isLoading = false,
  onGenerate,
}: TestShotButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [seedImagePath, setSeedImagePath] = useState(defaultSeedImagePath);
  const [durationSecs, setDurationSecs] = useState<string>("3.0");

  const handleSubmit = () => {
    onGenerate({
      scene_type_id: sceneTypeId,
      character_id: characterId,
      seed_image_path: seedImagePath,
      duration_secs: parseFloat(durationSecs) || 3.0,
    });
    setIsOpen(false);
  };

  return (
    <>
      <button
        data-testid="test-shot-trigger"
        type="button"
        disabled={isLoading}
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Generating..." : "Quick Test"}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Generate Test Shot"
        size="sm"
      >
        <div data-testid="test-shot-dialog" className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Seed Image Path
            </span>
            <input
              data-testid="seed-image-input"
              type="text"
              value={seedImagePath}
              onChange={(e) => setSeedImagePath(e.target.value)}
              className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
              placeholder="/path/to/seed.png"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Duration (seconds)
            </span>
            <input
              data-testid="duration-input"
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={durationSecs}
              onChange={(e) => setDurationSecs(e.target.value)}
              className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
            >
              Cancel
            </button>
            <button
              data-testid="generate-submit"
              type="button"
              disabled={!seedImagePath.trim()}
              onClick={handleSubmit}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
