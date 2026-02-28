import { describe, expect, it, vi } from "vitest";
import { sessionKeys } from "../hooks/use-session-management";

// API mock for hook tests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("sessionKeys factory", () => {
  it("returns correct base key", () => {
    expect(sessionKeys.all).toEqual(["sessions"]);
  });

  it("returns correct active key", () => {
    expect(sessionKeys.active()).toEqual(["sessions", "active"]);
  });

  it("returns correct analytics key", () => {
    expect(sessionKeys.analytics()).toEqual(["sessions", "analytics"]);
  });

  it("returns correct login-history key with filters", () => {
    const filters = { limit: "50", offset: "0" };
    expect(sessionKeys.loginHistory(filters)).toEqual([
      "sessions",
      "login-history",
      filters,
    ]);
  });

  it("returns correct configs key", () => {
    expect(sessionKeys.configs()).toEqual(["sessions", "configs"]);
  });

  it("returns correct mine key", () => {
    expect(sessionKeys.mine()).toEqual(["sessions", "mine"]);
  });
});

describe("hook module exports", () => {
  it("exports useActiveSessions", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useActiveSessions).toBe("function");
  });

  it("exports useSessionAnalytics", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useSessionAnalytics).toBe("function");
  });

  it("exports useLoginHistory", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useLoginHistory).toBe("function");
  });

  it("exports useForceTerminate", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useForceTerminate).toBe("function");
  });

  it("exports useSessionConfigs", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useSessionConfigs).toBe("function");
  });

  it("exports useUpdateConfig", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useUpdateConfig).toBe("function");
  });

  it("exports useMySessions", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useMySessions).toBe("function");
  });

  it("exports useHeartbeat", async () => {
    const mod = await import("../hooks/use-session-management");
    expect(typeof mod.useHeartbeat).toBe("function");
  });
});
