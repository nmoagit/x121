import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { GenerationProgressBar } from "../GenerationProgressBar";
import type { GenerationProgress } from "../types";

function makeProgress(
  overrides: Partial<GenerationProgress> = {},
): GenerationProgress {
  return {
    scene_id: 1,
    segments_completed: 3,
    segments_estimated: 6,
    cumulative_duration: 15,
    target_duration: 30,
    elapsed_secs: 20,
    estimated_remaining_secs: 20,
    ...overrides,
  };
}

describe("GenerationProgressBar", () => {
  it("renders segment strip with correct colours", () => {
    renderWithProviders(
      <GenerationProgressBar progress={makeProgress()} />,
    );

    // 3 completed, 1 generating, 2 pending = 6 total
    const blocks = screen.getAllByTestId(/^segment-block-/);
    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toHaveAttribute("data-status", "completed");
    expect(blocks[2]).toHaveAttribute("data-status", "completed");
    expect(blocks[3]).toHaveAttribute("data-status", "generating");
    expect(blocks[5]).toHaveAttribute("data-status", "pending");
  });

  it("shows duration counter", () => {
    renderWithProviders(
      <GenerationProgressBar progress={makeProgress()} />,
    );

    expect(screen.getByTestId("duration-counter")).toHaveTextContent(
      "15s / 30s target",
    );
  });

  it("shows percentage", () => {
    renderWithProviders(
      <GenerationProgressBar progress={makeProgress()} />,
    );

    expect(screen.getByTestId("percent-indicator")).toHaveTextContent("50%");
  });

  it("shows ETA", () => {
    renderWithProviders(
      <GenerationProgressBar
        progress={makeProgress({ estimated_remaining_secs: 45 })}
      />,
    );

    expect(screen.getByTestId("eta-display")).toHaveTextContent(
      "~45s remaining",
    );
  });

  it("shows 'Complete' when all segments are done", () => {
    renderWithProviders(
      <GenerationProgressBar
        progress={makeProgress({
          segments_completed: 6,
          segments_estimated: 6,
          estimated_remaining_secs: null,
        })}
      />,
    );

    expect(screen.getByTestId("percent-indicator")).toHaveTextContent(
      "Complete",
    );
  });
});
