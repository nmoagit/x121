/**
 * Tests for failure analytics query key factory and hook behavior (PRD-64).
 */

import { describe, expect, test } from "vitest";

import { failureAnalyticsKeys } from "../hooks/use-failure-analytics";

/* --------------------------------------------------------------------------
   Query key factory tests
   -------------------------------------------------------------------------- */

describe("failureAnalyticsKeys", () => {
  test("all returns base key", () => {
    expect(failureAnalyticsKeys.all).toEqual(["failure-analytics"]);
  });

  test("patterns includes params", () => {
    const key = failureAnalyticsKeys.patterns({ severity: "high", limit: 10 });
    expect(key).toEqual([
      "failure-analytics",
      "patterns",
      { severity: "high", limit: 10 },
    ]);
  });

  test("patterns without params", () => {
    const key = failureAnalyticsKeys.patterns();
    expect(key).toEqual(["failure-analytics", "patterns", undefined]);
  });

  test("pattern includes id", () => {
    const key = failureAnalyticsKeys.pattern(42);
    expect(key).toEqual(["failure-analytics", "pattern", 42]);
  });

  test("heatmap includes dimensions", () => {
    const key = failureAnalyticsKeys.heatmap("workflow", "character");
    expect(key).toEqual([
      "failure-analytics",
      "heatmap",
      "workflow",
      "character",
    ]);
  });

  test("trends includes pattern id and period", () => {
    const key = failureAnalyticsKeys.trends(5, 30);
    expect(key).toEqual(["failure-analytics", "trends", 5, 30]);
  });

  test("alerts includes workflow and character ids", () => {
    const key = failureAnalyticsKeys.alerts(10, 20);
    expect(key).toEqual(["failure-analytics", "alerts", 10, 20]);
  });

  test("alerts with undefined ids", () => {
    const key = failureAnalyticsKeys.alerts(undefined, undefined);
    expect(key).toEqual([
      "failure-analytics",
      "alerts",
      undefined,
      undefined,
    ]);
  });

  test("fixes includes pattern id", () => {
    const key = failureAnalyticsKeys.fixes(7);
    expect(key).toEqual(["failure-analytics", "fixes", 7]);
  });
});
