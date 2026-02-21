import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ContextualHint } from "../ContextualHint";

// Mock the api module.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 1,
      tour_completed: true,
      hints_dismissed_json: [],
      checklist_progress_json: {},
      feature_reveal_json: {},
      sample_project_id: null,
      created_at: "2026-02-21T10:00:00Z",
      updated_at: "2026-02-21T10:00:00Z",
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 1,
      tour_completed: true,
      hints_dismissed_json: [],
      checklist_progress_json: {},
      feature_reveal_json: {},
      sample_project_id: null,
      created_at: "2026-02-21T10:00:00Z",
      updated_at: "2026-02-21T10:00:00Z",
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ContextualHint", () => {
  it("shows the hint tooltip when not dismissed", async () => {
    renderWithProviders(
      <ContextualHint hintId="workflow_editor">
        <button>Edit Workflow</button>
      </ContextualHint>,
    );

    // The child element should always render.
    expect(screen.getByText("Edit Workflow")).toBeInTheDocument();

    // Wait for the hint tooltip to appear (after onboarding data loads).
    await waitFor(() => {
      expect(screen.getByTestId("hint-tooltip-workflow_editor")).toBeInTheDocument();
    });

    expect(screen.getByText(/Drag nodes to build/)).toBeInTheDocument();
    expect(screen.getByTestId("hint-got-it")).toBeInTheDocument();
    expect(screen.getByTestId("hint-dismiss-all")).toBeInTheDocument();
  });

  it("hides the hint when already dismissed", async () => {
    // Override the mock to return the hint as dismissed.
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      tour_completed: true,
      hints_dismissed_json: ["workflow_editor"],
      checklist_progress_json: {},
      feature_reveal_json: {},
      sample_project_id: null,
      created_at: "2026-02-21T10:00:00Z",
      updated_at: "2026-02-21T10:00:00Z",
    });

    renderWithProviders(
      <ContextualHint hintId="workflow_editor">
        <button>Edit Workflow</button>
      </ContextualHint>,
    );

    // The child should render but the tooltip should not.
    expect(screen.getByText("Edit Workflow")).toBeInTheDocument();

    // Give time for data to load, then verify tooltip is absent.
    await waitFor(() => {
      expect(
        screen.queryByTestId("hint-tooltip-workflow_editor"),
      ).not.toBeInTheDocument();
    });
  });

  it("dismisses the hint when Got it is clicked", async () => {
    renderWithProviders(
      <ContextualHint hintId="workflow_editor">
        <button>Edit Workflow</button>
      </ContextualHint>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("hint-got-it")).toBeInTheDocument();
    });

    screen.getByTestId("hint-got-it").click();

    // After clicking, the tooltip should disappear (locally dismissed).
    await waitFor(() => {
      expect(
        screen.queryByTestId("hint-tooltip-workflow_editor"),
      ).not.toBeInTheDocument();
    });
  });
});
