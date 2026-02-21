import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OnboardingChecklist } from "../OnboardingChecklist";

// Mock the api module.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 1,
      tour_completed: true,
      hints_dismissed_json: [],
      checklist_progress_json: {
        upload_portrait: true,
        run_generation: false,
      },
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

describe("OnboardingChecklist", () => {
  it("renders the checklist with items", async () => {
    renderWithProviders(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    });

    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Upload a character portrait")).toBeInTheDocument();
    expect(screen.getByText("Run your first generation")).toBeInTheDocument();
    expect(screen.getByText("Approve a segment")).toBeInTheDocument();
  });

  it("shows correct progress count", async () => {
    renderWithProviders(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("1 of 5 complete")).toBeInTheDocument();
    });

    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("renders a progress bar", async () => {
    renderWithProviders(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByTestId("checklist-progress-bar")).toBeInTheDocument();
    });

    const bar = screen.getByTestId("checklist-progress-bar");
    expect(bar).toHaveStyle({ width: "20%" });
  });

  it("hides the checklist when dismiss is clicked", async () => {
    renderWithProviders(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByTestId("checklist-dismiss");
    dismissBtn.click();

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-checklist")).not.toBeInTheDocument();
    });
  });
});
