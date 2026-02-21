import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isWebCodecsAvailable } from "./codec-detector";

describe("isWebCodecsAvailable", () => {
  it("returns false when VideoDecoder is not defined", () => {
    // jsdom doesn't define VideoDecoder
    expect(isWebCodecsAvailable()).toBe(false);
  });
});

describe("detectCodecCapabilities", () => {
  beforeEach(() => {
    // Reset module cache so each test gets fresh cachedCapabilities
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns capabilities for all codecs when supported", async () => {
    const mockIsTypeSupported = vi.fn().mockReturnValue(true);
    vi.stubGlobal("MediaSource", { isTypeSupported: mockIsTypeSupported });

    const { detectCodecCapabilities } = await import("./codec-detector");
    const caps = await detectCodecCapabilities();

    expect(caps).toHaveLength(5);
    expect(caps.map((c) => c.label)).toEqual([
      "H.264 Baseline",
      "H.264 Main",
      "H.265/HEVC",
      "VP9",
      "AV1",
    ]);
    expect(caps.every((c) => c.supported)).toBe(true);
    expect(caps.every((c) => !c.hardwareAccelerated)).toBe(true);
  });

  it("marks unsupported codecs correctly", async () => {
    const mockIsTypeSupported = vi.fn().mockReturnValue(false);
    vi.stubGlobal("MediaSource", { isTypeSupported: mockIsTypeSupported });

    const { detectCodecCapabilities } = await import("./codec-detector");
    const caps = await detectCodecCapabilities();

    expect(caps.every((c) => !c.supported)).toBe(true);
  });
});
