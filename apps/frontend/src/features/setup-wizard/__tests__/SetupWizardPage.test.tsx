/**
 * Tests for SetupWizardPage component (PRD-105).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SetupWizardPage } from "../SetupWizardPage";
import type { WizardState } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockWizardState: WizardState = {
  steps: [
    {
      name: "database",
      completed: true,
      validated_at: "2026-02-28T10:00:00Z",
      error_message: null,
      has_config: true,
    },
    {
      name: "storage",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
    {
      name: "comfyui",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
    {
      name: "admin_account",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
    {
      name: "worker_registration",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
    {
      name: "integrations",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
    {
      name: "health_check",
      completed: false,
      validated_at: null,
      error_message: null,
      has_config: false,
    },
  ],
  completed: false,
  current_step_index: 1,
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path === "/admin/setup/status") return Promise.resolve(mockWizardState);
      if (path.startsWith("/admin/setup/step/")) return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    post: vi.fn(() => Promise.resolve({ success: true, message: "OK", details: null })),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SetupWizardPage", () => {
  test("renders the page title", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform Setup")).toBeInTheDocument();
    });
  });

  test("renders PRD badge", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByText("PRD-105")).toBeInTheDocument();
    });
  });

  test("renders step progress indicator", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("step-progress")).toBeInTheDocument();
    });
  });

  test("renders the current step content area", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("step-content")).toBeInTheDocument();
    });
  });

  test("renders navigation buttons", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("wizard-navigation")).toBeInTheDocument();
      expect(screen.getByTestId("prev-step-btn")).toBeInTheDocument();
      expect(screen.getByTestId("next-step-btn")).toBeInTheDocument();
    });
  });

  test("renders skip wizard link", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("skip-wizard-link")).toBeInTheDocument();
    });
  });

  test("navigates to next step on next button click", async () => {
    renderWithProviders(<SetupWizardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("next-step-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Step counter should advance
    expect(screen.getByText(/Step 3 of 7/)).toBeInTheDocument();
  });
});
