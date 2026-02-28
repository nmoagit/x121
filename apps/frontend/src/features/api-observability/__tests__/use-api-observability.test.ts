import { describe, expect, it, vi } from "vitest";
import { observabilityKeys } from "../hooks/use-api-observability";

// API mock for hook tests that import the module indirectly.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("observabilityKeys factory", () => {
  it("returns correct base key", () => {
    expect(observabilityKeys.all).toEqual(["api-observability"]);
  });

  it("returns correct metrics key with filters", () => {
    expect(observabilityKeys.metrics({ period: "24h" })).toEqual([
      "api-observability",
      "metrics",
      { period: "24h" },
    ]);
  });

  it("returns correct summary key with period", () => {
    expect(observabilityKeys.summary("7d")).toEqual([
      "api-observability",
      "summary",
      "7d",
    ]);
  });

  it("returns correct endpoints key with period", () => {
    expect(observabilityKeys.endpoints("1h")).toEqual([
      "api-observability",
      "endpoints",
      "1h",
    ]);
  });

  it("returns correct top consumers key with sort, period, limit", () => {
    expect(observabilityKeys.topConsumers("error_rate", "24h", 10)).toEqual([
      "api-observability",
      "top-consumers",
      "error_rate",
      "24h",
      10,
    ]);
  });

  it("returns correct heatmap key with granularity and period", () => {
    expect(observabilityKeys.heatmap("1h", "7d")).toEqual([
      "api-observability",
      "heatmap",
      "1h",
      "7d",
    ]);
  });

  it("returns correct rate limits key", () => {
    expect(observabilityKeys.rateLimits()).toEqual([
      "api-observability",
      "rate-limits",
    ]);
  });

  it("returns correct rate limit history key with keyId", () => {
    expect(observabilityKeys.rateLimitHistory(42)).toEqual([
      "api-observability",
      "rate-limit-history",
      42,
    ]);
  });

  it("returns correct alerts key", () => {
    expect(observabilityKeys.alerts()).toEqual([
      "api-observability",
      "alerts",
    ]);
  });
});

describe("hook module exports", () => {
  it("exports useMetrics", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useMetrics).toBe("function");
  });

  it("exports useMetricsSummary", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useMetricsSummary).toBe("function");
  });

  it("exports useEndpointBreakdown", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useEndpointBreakdown).toBe("function");
  });

  it("exports useTopConsumers", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useTopConsumers).toBe("function");
  });

  it("exports useHeatmap", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useHeatmap).toBe("function");
  });

  it("exports useRateLimits", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useRateLimits).toBe("function");
  });

  it("exports useRateLimitHistory", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useRateLimitHistory).toBe("function");
  });

  it("exports useAlertConfigs", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useAlertConfigs).toBe("function");
  });

  it("exports useCreateAlert", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useCreateAlert).toBe("function");
  });

  it("exports useUpdateAlert", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useUpdateAlert).toBe("function");
  });

  it("exports useDeleteAlert", async () => {
    const mod = await import("../hooks/use-api-observability");
    expect(typeof mod.useDeleteAlert).toBe("function");
  });
});
