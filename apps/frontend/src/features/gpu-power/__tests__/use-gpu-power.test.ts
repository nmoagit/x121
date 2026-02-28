import { describe, expect, it } from "vitest";
import { gpuPowerKeys } from "../hooks/use-gpu-power";

describe("gpuPowerKeys", () => {
  it("generates a stable root key", () => {
    expect(gpuPowerKeys.all).toEqual(["gpu-power"]);
  });

  it("generates a worker status key with worker id", () => {
    expect(gpuPowerKeys.workerStatus(42)).toEqual([
      "gpu-power",
      "worker-status",
      42,
    ]);
  });

  it("generates a fleet status key", () => {
    expect(gpuPowerKeys.fleetStatus()).toEqual(["gpu-power", "fleet-status"]);
  });

  it("generates a fleet settings key", () => {
    expect(gpuPowerKeys.fleetSettings()).toEqual([
      "gpu-power",
      "fleet-settings",
    ]);
  });

  it("generates a consumption key with params", () => {
    const params = {
      from: "2026-02-01",
      to: "2026-02-28",
    };
    expect(gpuPowerKeys.consumption(params)).toEqual([
      "gpu-power",
      "consumption",
      params,
    ]);
  });
});
