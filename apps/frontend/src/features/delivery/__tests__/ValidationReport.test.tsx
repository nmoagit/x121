import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ValidationReport } from "../ValidationReport";
import type { DeliveryValidationResponse } from "../types";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      passed: false,
      error_count: 1,
      warning_count: 1,
      issues: [],
    }),
  },
}));

const failResult: DeliveryValidationResponse = {
  passed: false,
  error_count: 1,
  warning_count: 1,
  issues: [
    {
      severity: "error",
      category: "missing_video",
      message: "Scene 5 has no video file",
      entity_id: 5,
    },
    {
      severity: "warning",
      category: "encoding",
      message: "Low bitrate detected",
      entity_id: null,
    },
  ],
};

const passResult: DeliveryValidationResponse = {
  passed: true,
  error_count: 0,
  warning_count: 0,
  issues: [],
};

describe("ValidationReport", () => {
  it("renders pass/fail summary", () => {
    renderWithProviders(
      <ValidationReport projectId={1} initialData={passResult} />,
    );

    expect(screen.getByTestId("validation-summary")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
  });

  it("shows error and warning badges with correct colors", () => {
    renderWithProviders(
      <ValidationReport projectId={1} initialData={failResult} />,
    );

    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("renders issue details with entity IDs", () => {
    renderWithProviders(
      <ValidationReport projectId={1} initialData={failResult} />,
    );

    const issues = screen.getAllByTestId("validation-issue");
    expect(issues).toHaveLength(2);
    expect(screen.getByText("Scene 5 has no video file")).toBeInTheDocument();
    expect(screen.getByText("(ID: 5)")).toBeInTheDocument();
    expect(screen.getByText("Low bitrate detected")).toBeInTheDocument();
  });
});
