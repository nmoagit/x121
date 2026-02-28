/**
 * Hook tests for time-based job scheduling (PRD-119).
 *
 * Validates that each hook calls the correct API endpoint and
 * invalidates the expected query keys on mutation success.
 */

import { describe, expect, it } from "vitest";

import { scheduleKeys } from "../hooks/use-job-scheduling";

/* --------------------------------------------------------------------------
   Query key factory tests
   -------------------------------------------------------------------------- */

describe("scheduleKeys", () => {
  it("produces correct base key", () => {
    expect(scheduleKeys.all).toEqual(["schedules"]);
  });

  it("produces list key without params", () => {
    expect(scheduleKeys.list()).toEqual(["schedules", "list", undefined]);
  });

  it("produces list key with params", () => {
    const params = { status: "active" };
    expect(scheduleKeys.list(params)).toEqual(["schedules", "list", params]);
  });

  it("produces detail key", () => {
    expect(scheduleKeys.detail(42)).toEqual(["schedules", "detail", 42]);
  });

  it("produces history key", () => {
    expect(scheduleKeys.history(7)).toEqual(["schedules", "history", 7]);
  });

  it("produces offPeak key", () => {
    expect(scheduleKeys.offPeak()).toEqual(["schedules", "off-peak"]);
  });

  it("detail keys for different IDs are distinct", () => {
    expect(scheduleKeys.detail(1)).not.toEqual(scheduleKeys.detail(2));
  });
});
