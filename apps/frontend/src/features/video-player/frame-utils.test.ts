import { describe, expect, it } from "vitest";

import {
  formatDuration,
  frameToSeconds,
  frameToTimecode,
  secondsToFrame,
  timecodeToFrame,
} from "./frame-utils";

describe("frameToTimecode", () => {
  it("converts frame 0 to 00:00:00:00", () => {
    expect(frameToTimecode(0, 24)).toBe("00:00:00:00");
  });

  it("converts mid-second frame", () => {
    // Frame 12 at 24fps = 0.5s → 00:00:00:12
    expect(frameToTimecode(12, 24)).toBe("00:00:00:12");
  });

  it("converts full seconds", () => {
    // Frame 48 at 24fps = 2.0s → 00:00:02:00
    expect(frameToTimecode(48, 24)).toBe("00:00:02:00");
  });

  it("converts minutes", () => {
    // Frame 1440 at 24fps = 60s → 00:01:00:00
    expect(frameToTimecode(1440, 24)).toBe("00:01:00:00");
  });

  it("converts hours", () => {
    // Frame 86400 at 24fps = 3600s → 01:00:00:00
    expect(frameToTimecode(86400, 24)).toBe("01:00:00:00");
  });

  it("handles 30fps", () => {
    // Frame 30 at 30fps = 1s → 00:00:01:00
    expect(frameToTimecode(30, 30)).toBe("00:00:01:00");
  });

  it("returns zero for fps <= 0", () => {
    expect(frameToTimecode(100, 0)).toBe("00:00:00:00");
    expect(frameToTimecode(100, -1)).toBe("00:00:00:00");
  });
});

describe("timecodeToFrame", () => {
  it("converts 00:00:00:00 to frame 0", () => {
    expect(timecodeToFrame("00:00:00:00", 24)).toBe(0);
  });

  it("converts timecode with frames", () => {
    expect(timecodeToFrame("00:00:00:12", 24)).toBe(12);
  });

  it("converts seconds", () => {
    expect(timecodeToFrame("00:00:02:00", 24)).toBe(48);
  });

  it("converts minutes", () => {
    expect(timecodeToFrame("00:01:00:00", 24)).toBe(1440);
  });

  it("converts hours", () => {
    expect(timecodeToFrame("01:00:00:00", 24)).toBe(86400);
  });

  it("returns 0 for invalid format", () => {
    expect(timecodeToFrame("invalid", 24)).toBe(0);
    expect(timecodeToFrame("00:00:00", 24)).toBe(0);
  });

  it("returns 0 for fps <= 0", () => {
    expect(timecodeToFrame("00:00:01:00", 0)).toBe(0);
  });
});

describe("frameToSeconds", () => {
  it("converts frame to seconds", () => {
    expect(frameToSeconds(48, 24)).toBeCloseTo(2.0);
  });

  it("handles non-integer results", () => {
    expect(frameToSeconds(1, 24)).toBeCloseTo(1 / 24);
  });

  it("returns 0 for fps <= 0", () => {
    expect(frameToSeconds(100, 0)).toBe(0);
  });
});

describe("secondsToFrame", () => {
  it("converts seconds to frame", () => {
    expect(secondsToFrame(2.0, 24)).toBe(48);
  });

  it("floors partial frames", () => {
    expect(secondsToFrame(2.04, 24)).toBe(48);
  });

  it("returns 0 for fps <= 0", () => {
    expect(secondsToFrame(10, 0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0:00");
  });
});
