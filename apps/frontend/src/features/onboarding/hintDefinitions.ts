/**
 * Contextual hint definitions (PRD-53).
 *
 * Each hint is associated with a specific UI area and provides a
 * short instructional message shown on first encounter.
 */

import type { HintDefinition } from "./types";

export type { HintDefinition };

/** All known contextual hints keyed by hint ID. */
export const hintDefinitions: Record<string, HintDefinition> = {
  workflow_editor: {
    message:
      "Drag nodes to build a generation workflow. Connect outputs to inputs to define the pipeline.",
    placement: "bottom",
  },
  review_queue: {
    message:
      "Segments waiting for review appear here. Use keyboard shortcuts to speed up your workflow.",
    placement: "bottom",
  },
  library: {
    message: "Browse and compare all generated images. Use filters to narrow down results.",
    placement: "bottom",
  },
  generation: {
    message: "Select a character and scene type, then click Generate to start a job.",
    placement: "left",
  },
  settings: {
    message:
      "Configure your workspace preferences, keyboard shortcuts, and notification settings here.",
    placement: "right",
  },
};
