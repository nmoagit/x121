import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DriftTrendChart } from "../DriftTrendChart";
import type { EnrichedTemporalMetric, TrendDirection } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

function makeMetric(
  overrides: Partial<EnrichedTemporalMetric> = {},
  index = 1,
): EnrichedTemporalMetric {
  return {
    id: index,
    segment_id: index,
    drift_score: 0.1,
    centering_offset_x: 5,
    centering_offset_y: 3,
    grain_variance: 120.5,
    grain_match_score: 0.92,
    subject_bbox: null,
    analysis_version: "v1",
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
    drift_severity: "normal",
    grain_quality: "good",
    ...overrides,
  };
}

const sampleMetrics: EnrichedTemporalMetric[] = [
  makeMetric({ drift_score: 0.05, drift_severity: "normal" }, 1),
  makeMetric({ drift_score: 0.12, drift_severity: "normal" }, 2),
  makeMetric({ drift_score: 0.18, drift_severity: "warning" }, 3),
  makeMetric({ drift_score: 0.35, drift_severity: "critical" }, 4),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DriftTrendChart", () => {
  it("renders without crashing with valid metrics", () => {
    const { container } = renderWithProviders(
      <DriftTrendChart
        metrics={sampleMetrics}
        driftTrend={"worsening" as TrendDirection}
        isLoading={false}
      />,
    );
    expect(container).toBeTruthy();
  });

  it("shows loading spinner when isLoading is true", () => {
    const { container } = renderWithProviders(
      <DriftTrendChart metrics={[]} driftTrend={"stable"} isLoading={true} />,
    );
    // Spinner renders a role="status" or similar element
    const spinner = container.querySelector("[class*='animate-spin']");
    expect(spinner).toBeTruthy();
  });

  it("shows empty message when no metrics provided", () => {
    const { getByText } = renderWithProviders(
      <DriftTrendChart metrics={[]} driftTrend={"stable"} isLoading={false} />,
    );
    expect(
      getByText("No temporal metrics available for this scene."),
    ).toBeTruthy();
  });

  it("renders trend label", () => {
    const { getByText } = renderWithProviders(
      <DriftTrendChart
        metrics={sampleMetrics}
        driftTrend={"worsening"}
        isLoading={false}
      />,
    );
    expect(getByText("Trend: Worsening")).toBeTruthy();
  });

  it("renders view toggle buttons", () => {
    const { getByText } = renderWithProviders(
      <DriftTrendChart
        metrics={sampleMetrics}
        driftTrend={"stable"}
        isLoading={false}
      />,
    );
    expect(getByText("Drift Score")).toBeTruthy();
    expect(getByText("Centering Offset")).toBeTruthy();
    expect(getByText("Grain Match")).toBeTruthy();
  });
});
