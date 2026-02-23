import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OnboardingWizard } from "../OnboardingWizard";
import { StepIndicator } from "../StepIndicator";
import { StepSummary } from "../StepSummary";
import { StepUpload } from "../StepUpload";
import { onboardingKeys } from "../hooks/use-onboarding-wizard";
import type { OnboardingSession } from "../types";
import { STEP_LABELS, TOTAL_STEPS } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeSession = (
  overrides: Partial<OnboardingSession> = {},
): OnboardingSession => ({
  id: 1,
  project_id: 10,
  created_by_id: 100,
  current_step: 1,
  step_data: {},
  character_ids: [],
  status: "in_progress",
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

/* --------------------------------------------------------------------------
   StepIndicator tests
   -------------------------------------------------------------------------- */

describe("StepIndicator", () => {
  it("renders all step indicators", () => {
    renderWithProviders(<StepIndicator currentStep={1} />);

    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      expect(screen.getByTestId(`step-${i}`)).toBeInTheDocument();
    }
  });

  it("highlights the current step", () => {
    renderWithProviders(<StepIndicator currentStep={3} />);

    const step3 = screen.getByTestId("step-3");
    expect(step3.className).toContain("bg-[var(--color-action-primary)]");
  });

  it("shows check mark for completed steps", () => {
    renderWithProviders(<StepIndicator currentStep={4} />);

    // Steps 1-3 should be completed (show check)
    expect(screen.getByTestId("step-number-1")).toHaveTextContent("\u2713");
    expect(screen.getByTestId("step-number-2")).toHaveTextContent("\u2713");
    expect(screen.getByTestId("step-number-3")).toHaveTextContent("\u2713");
    // Step 4 should show its number
    expect(screen.getByTestId("step-number-4")).toHaveTextContent("4");
  });

  it("shows step count badge", () => {
    renderWithProviders(<StepIndicator currentStep={2} />);

    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
  });

  it("connector lines between steps", () => {
    renderWithProviders(<StepIndicator currentStep={1} />);

    // 5 connectors between 6 steps
    for (let i = 1; i < TOTAL_STEPS; i++) {
      expect(screen.getByTestId(`connector-${i}`)).toBeInTheDocument();
    }
  });
});

/* --------------------------------------------------------------------------
   OnboardingWizard tests
   -------------------------------------------------------------------------- */

describe("OnboardingWizard", () => {
  const defaultProps = {
    session: makeSession(),
    onAdvance: vi.fn(),
    onGoBack: vi.fn(),
    onUpdateStepData: vi.fn(),
    onAbandon: vi.fn(),
    onComplete: vi.fn(),
  };

  it("renders the wizard shell", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
    expect(screen.getByText("Character Onboarding Wizard")).toBeInTheDocument();
  });

  it("renders step indicator", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
  });

  it("renders step 1 (Upload) by default", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("step-upload")).toBeInTheDocument();
  });

  it("renders step content area", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("step-content")).toBeInTheDocument();
  });

  it("shows navigation buttons", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("wizard-navigation")).toBeInTheDocument();
    expect(screen.getByTestId("back-btn")).toBeInTheDocument();
    expect(screen.getByTestId("next-btn")).toBeInTheDocument();
    expect(screen.getByTestId("abandon-btn")).toBeInTheDocument();
  });

  it("disables back button on first step", () => {
    renderWithProviders(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("back-btn")).toBeDisabled();
  });

  it("calls onAdvance when next is clicked", () => {
    const onAdvance = vi.fn();
    renderWithProviders(
      <OnboardingWizard {...defaultProps} onAdvance={onAdvance} />,
    );

    fireEvent.click(screen.getByTestId("next-btn"));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("calls onGoBack when back is clicked on step 2", () => {
    const onGoBack = vi.fn();
    renderWithProviders(
      <OnboardingWizard
        {...defaultProps}
        session={makeSession({ current_step: 2 })}
        onGoBack={onGoBack}
      />,
    );

    fireEvent.click(screen.getByTestId("back-btn"));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("calls onAbandon when abandon is clicked", () => {
    const onAbandon = vi.fn();
    renderWithProviders(
      <OnboardingWizard {...defaultProps} onAbandon={onAbandon} />,
    );

    fireEvent.click(screen.getByTestId("abandon-btn"));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  it("hides navigation for completed sessions", () => {
    renderWithProviders(
      <OnboardingWizard
        {...defaultProps}
        session={makeSession({ status: "completed" })}
      />,
    );

    expect(screen.queryByTestId("wizard-navigation")).not.toBeInTheDocument();
  });

  it("shows Completed badge for completed sessions", () => {
    renderWithProviders(
      <OnboardingWizard
        {...defaultProps}
        session={makeSession({ status: "completed" })}
      />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows Abandoned badge for abandoned sessions", () => {
    renderWithProviders(
      <OnboardingWizard
        {...defaultProps}
        session={makeSession({ status: "abandoned" })}
      />,
    );

    expect(screen.getByText("Abandoned")).toBeInTheDocument();
  });

  it("does not show next button on last step", () => {
    renderWithProviders(
      <OnboardingWizard
        {...defaultProps}
        session={makeSession({ current_step: 6 })}
      />,
    );

    expect(screen.queryByTestId("next-btn")).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   StepUpload tests
   -------------------------------------------------------------------------- */

describe("StepUpload", () => {
  it("renders upload interface", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload stepData={{}} onUpdateStepData={onUpdate} />,
    );

    expect(screen.getByTestId("step-upload")).toBeInTheDocument();
    expect(screen.getByText("Upload Characters")).toBeInTheDocument();
  });

  it("shows upload mode toggle", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload stepData={{}} onUpdateStepData={onUpdate} />,
    );

    expect(screen.getByTestId("upload-mode-toggle")).toBeInTheDocument();
  });

  it("shows image drop zone by default", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload stepData={{}} onUpdateStepData={onUpdate} />,
    );

    expect(screen.getByTestId("image-drop-zone")).toBeInTheDocument();
  });

  it("switches to CSV mode", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload stepData={{}} onUpdateStepData={onUpdate} />,
    );

    fireEvent.click(screen.getByText("CSV / Text Upload"));
    expect(screen.getByTestId("csv-upload-zone")).toBeInTheDocument();
  });

  it("shows file preview list when files present", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload
        stepData={{ files: ["file1.png", "file2.png"] }}
        onUpdateStepData={onUpdate}
      />,
    );

    expect(screen.getByTestId("file-preview-list")).toBeInTheDocument();
    expect(screen.getByTestId("file-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("file-item-1")).toBeInTheDocument();
  });

  it("shows ready badge when files are present", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload
        stepData={{ files: ["file1.png"] }}
        onUpdateStepData={onUpdate}
      />,
    );

    expect(screen.getByText("Ready to advance")).toBeInTheDocument();
  });

  it("removes a file when remove is clicked", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <StepUpload
        stepData={{ files: ["file1.png", "file2.png"] }}
        onUpdateStepData={onUpdate}
      />,
    );

    fireEvent.click(screen.getByTestId("remove-file-0"));
    expect(onUpdate).toHaveBeenCalledWith({
      files: ["file2.png"],
    });
  });
});

/* --------------------------------------------------------------------------
   StepSummary tests
   -------------------------------------------------------------------------- */

describe("StepSummary", () => {
  it("renders summary cards", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{
          scene_types: [1, 2],
          metadata: [{ character_id: 1 }],
          reviewed_variants: [{ approved: true }],
        }}
        characterIds={[1, 2, 3]}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("step-summary")).toBeInTheDocument();
    expect(screen.getByTestId("summary-characters")).toBeInTheDocument();
    expect(screen.getByTestId("summary-variants")).toBeInTheDocument();
    expect(screen.getByTestId("summary-metadata")).toBeInTheDocument();
    expect(screen.getByTestId("summary-scene-types")).toBeInTheDocument();
  });

  it("shows correct character count", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{}}
        characterIds={[1, 2, 3]}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("summary-characters")).toHaveTextContent("3");
  });

  it("shows total generation cells", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{ scene_types: [1, 2] }}
        characterIds={[1, 2, 3]}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("summary-total")).toHaveTextContent(
      "Total generation cells: 6",
    );
  });

  it("calls onComplete when submit is clicked", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{}}
        characterIds={[1]}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByTestId("submit-btn"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("disables submit when no characters", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{}}
        characterIds={[]}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("submit-btn")).toBeDisabled();
  });

  it("shows submitting state", () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <StepSummary
        stepData={{}}
        characterIds={[1]}
        isSubmitting
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText("Submitting...")).toBeInTheDocument();
    expect(screen.getByTestId("submit-btn")).toBeDisabled();
  });
});

/* --------------------------------------------------------------------------
   Hook key factory tests
   -------------------------------------------------------------------------- */

describe("onboardingKeys", () => {
  it("all key is stable", () => {
    expect(onboardingKeys.all).toEqual(["onboarding-sessions"]);
  });

  it("detail includes id", () => {
    expect(onboardingKeys.detail(42)).toEqual([
      "onboarding-sessions",
      "detail",
      42,
    ]);
  });

  it("byProject includes projectId", () => {
    expect(onboardingKeys.byProject(10)).toEqual([
      "onboarding-sessions",
      "project",
      10,
    ]);
  });
});

/* --------------------------------------------------------------------------
   Types tests
   -------------------------------------------------------------------------- */

describe("types", () => {
  it("STEP_LABELS has entries for all steps", () => {
    expect(Object.keys(STEP_LABELS).length).toBe(TOTAL_STEPS);
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      expect(STEP_LABELS[i as 1 | 2 | 3 | 4 | 5 | 6]).toBeTruthy();
    }
  });

  it("TOTAL_STEPS is 6", () => {
    expect(TOTAL_STEPS).toBe(6);
  });
});
