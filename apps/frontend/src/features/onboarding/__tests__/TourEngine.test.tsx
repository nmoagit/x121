import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TourEngine } from "../TourEngine";
import type { TourStep } from "../types";

// Mock the api module.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 1,
      tour_completed: false,
      hints_dismissed_json: [],
      checklist_progress_json: {},
      feature_reveal_json: {},
      sample_project_id: null,
      created_at: "2026-02-21T10:00:00Z",
      updated_at: "2026-02-21T10:00:00Z",
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

const STEPS: TourStep[] = [
  {
    target: "[data-tour='nav']",
    title: "Navigation",
    description: "Use the sidebar to navigate.",
    placement: "right",
  },
  {
    target: "[data-tour='projects']",
    title: "Projects",
    description: "Your projects appear here.",
    placement: "bottom",
  },
  {
    target: "[data-tour='settings']",
    title: "Settings",
    description: "Configure preferences here.",
    placement: "left",
  },
];

describe("TourEngine", () => {
  const onComplete = vi.fn();
  const onSkip = vi.fn();

  it("renders the first step and progress indicator", () => {
    renderWithProviders(
      <TourEngine steps={STEPS} onComplete={onComplete} onSkip={onSkip} />,
    );

    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Use the sidebar to navigate.")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByTestId("tour-overlay")).toBeInTheDocument();
  });

  it("progresses through steps on Next click", () => {
    renderWithProviders(
      <TourEngine steps={STEPS} onComplete={onComplete} onSkip={onSkip} />,
    );

    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("calls onSkip when Skip tour is clicked", () => {
    renderWithProviders(
      <TourEngine steps={STEPS} onComplete={onComplete} onSkip={onSkip} />,
    );

    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(onSkip).toHaveBeenCalled();
  });

  it("calls onComplete when Finish is clicked on last step", () => {
    renderWithProviders(
      <TourEngine steps={STEPS} onComplete={onComplete} onSkip={onSkip} />,
    );

    // Navigate to the last step.
    fireEvent.click(screen.getByTestId("tour-next"));
    fireEvent.click(screen.getByTestId("tour-next"));

    // Last step should show "Finish" instead of "Next".
    expect(screen.getByText("Finish")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tour-next"));
    expect(onComplete).toHaveBeenCalled();
  });
});
