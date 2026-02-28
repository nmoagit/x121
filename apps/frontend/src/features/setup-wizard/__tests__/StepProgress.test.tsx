/**
 * Tests for StepProgress component (PRD-105).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { StepProgress } from "../StepProgress";
import type { StepStatus } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockSteps: StepStatus[] = [
  {
    name: "database",
    completed: true,
    validated_at: "2026-02-28T10:00:00Z",
    error_message: null,
    has_config: true,
  },
  {
    name: "storage",
    completed: true,
    validated_at: "2026-02-28T10:05:00Z",
    error_message: null,
    has_config: true,
  },
  { name: "comfyui", completed: false, validated_at: null, error_message: null, has_config: false },
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
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("StepProgress", () => {
  test("renders all step dots", () => {
    renderWithProviders(<StepProgress steps={mockSteps} currentIndex={2} />);

    expect(screen.getByTestId("step-dot-database")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-storage")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-comfyui")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-admin_account")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-worker_registration")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-integrations")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-health_check")).toBeInTheDocument();
  });

  test("renders step labels", () => {
    renderWithProviders(<StepProgress steps={mockSteps} currentIndex={2} />);

    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("ComfyUI")).toBeInTheDocument();
    expect(screen.getByText("Admin Account")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
    expect(screen.getByText("Integrations")).toBeInTheDocument();
    expect(screen.getByText("Health Check")).toBeInTheDocument();
  });

  test("renders connector lines between steps", () => {
    renderWithProviders(<StepProgress steps={mockSteps} currentIndex={2} />);

    // 6 connectors between 7 steps
    expect(screen.getByTestId("connector-0")).toBeInTheDocument();
    expect(screen.getByTestId("connector-5")).toBeInTheDocument();
  });

  test("calls onStepClick when a step dot is clicked", () => {
    const onStepClick = vi.fn();

    renderWithProviders(
      <StepProgress steps={mockSteps} currentIndex={2} onStepClick={onStepClick} />,
    );

    fireEvent.click(screen.getByTestId("step-dot-database"));
    expect(onStepClick).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByTestId("step-dot-health_check"));
    expect(onStepClick).toHaveBeenCalledWith(6);
  });

  test("renders the progress container", () => {
    renderWithProviders(<StepProgress steps={mockSteps} currentIndex={0} />);

    expect(screen.getByTestId("step-progress")).toBeInTheDocument();
  });

  test("renders correct number label for uncompleted steps", () => {
    renderWithProviders(<StepProgress steps={mockSteps} currentIndex={2} />);

    // Step 3 (comfyui, index 2) should show number "3"
    expect(screen.getByText("3")).toBeInTheDocument();
    // Step 4 should show "4"
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
