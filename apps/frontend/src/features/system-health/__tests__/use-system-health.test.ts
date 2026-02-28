import { describe, expect, it, vi } from "vitest";
import { healthKeys } from "../hooks/use-system-health";

// API mock for hook tests that import the module indirectly.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("healthKeys factory", () => {
  it("returns correct base key", () => {
    expect(healthKeys.all).toEqual(["system-health"]);
  });

  it("returns correct statuses key", () => {
    expect(healthKeys.statuses()).toEqual(["system-health", "statuses"]);
  });

  it("returns correct service key with name", () => {
    expect(healthKeys.service("database")).toEqual([
      "system-health",
      "service",
      "database",
    ]);
  });

  it("returns correct uptime key", () => {
    expect(healthKeys.uptime()).toEqual(["system-health", "uptime"]);
  });

  it("returns correct checklist key", () => {
    expect(healthKeys.checklist()).toEqual(["system-health", "checklist"]);
  });

  it("returns correct alerts key", () => {
    expect(healthKeys.alerts()).toEqual(["system-health", "alerts"]);
  });
});

describe("useServiceStatuses endpoint", () => {
  it("hook module exports useServiceStatuses", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useServiceStatuses).toBe("function");
  });

  it("hook module exports useServiceDetail", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useServiceDetail).toBe("function");
  });

  it("hook module exports useUptime", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useUptime).toBe("function");
  });

  it("hook module exports useStartupChecklist", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useStartupChecklist).toBe("function");
  });

  it("hook module exports useRecheckService", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useRecheckService).toBe("function");
  });

  it("hook module exports useUpdateAlertConfig", async () => {
    const mod = await import("../hooks/use-system-health");
    expect(typeof mod.useUpdateAlertConfig).toBe("function");
  });
});
