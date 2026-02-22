/**
 * Tests for QaScorecard component (PRD-49).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { QaScorecard } from "../QaScorecard";
import type { QualityScore } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const scores: QualityScore[] = [
  {
    id: 1,
    segment_id: 10,
    check_type: "face_confidence",
    score: 0.92,
    status: "pass",
    details: { model: "retinaface", confidence: 0.92 },
    threshold_used: 0.7,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    segment_id: 10,
    check_type: "boundary_ssim",
    score: 0.72,
    status: "warn",
    details: null,
    threshold_used: 0.85,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 3,
    segment_id: 10,
    check_type: "motion",
    score: 0.05,
    status: "fail",
    details: { frame_count: 120, avg_flow: 0.05 },
    threshold_used: 0.1,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("QaScorecard", () => {
  test("renders check types with labels", () => {
    renderWithProviders(<QaScorecard scores={scores} />);

    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
    expect(screen.getByText("Boundary SSIM")).toBeInTheDocument();
    expect(screen.getByText("Motion")).toBeInTheDocument();
  });

  test("shows correct traffic light colors for pass/warn/fail", () => {
    renderWithProviders(<QaScorecard scores={scores} />);

    expect(screen.getByTestId("traffic-light-pass")).toBeInTheDocument();
    expect(screen.getByTestId("traffic-light-warn")).toBeInTheDocument();
    expect(screen.getByTestId("traffic-light-fail")).toBeInTheDocument();
  });

  test("displays numeric scores", () => {
    renderWithProviders(<QaScorecard scores={scores} />);

    expect(screen.getByTestId("score-value-face_confidence")).toHaveTextContent("0.92");
    expect(screen.getByTestId("score-value-boundary_ssim")).toHaveTextContent("0.72");
    expect(screen.getByTestId("score-value-motion")).toHaveTextContent("0.05");
  });

  test("expands details on click", () => {
    renderWithProviders(<QaScorecard scores={scores} />);

    // Details should not be visible initially.
    expect(
      screen.queryByTestId("score-details-face_confidence"),
    ).not.toBeInTheDocument();

    // Click to expand.
    fireEvent.click(
      screen.getByRole("button", {
        name: /toggle details for face confidence/i,
      }),
    );
    expect(
      screen.getByTestId("score-details-face_confidence"),
    ).toBeInTheDocument();
    expect(screen.getByText(/"model":\s*"retinaface"/)).toBeInTheDocument();
  });
});
