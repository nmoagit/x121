import { describe, expect, it } from "vitest";

import { branchKeys } from "../hooks/use-branching";

/* --------------------------------------------------------------------------
   Query Key Factory Tests
   -------------------------------------------------------------------------- */

describe("branchKeys", () => {
  it("produces stable all key", () => {
    expect(branchKeys.all).toEqual(["branches"]);
  });

  it("produces stable byScene key", () => {
    expect(branchKeys.byScene(42)).toEqual(["branches", "scene", 42]);
  });

  it("produces stable detail key", () => {
    expect(branchKeys.detail(7)).toEqual(["branches", "detail", 7]);
  });

  it("produces stable compare key", () => {
    expect(branchKeys.compare(1, 2)).toEqual(["branches", "compare", 1, 2]);
  });

  it("produces stable stale key with days", () => {
    expect(branchKeys.stale(30)).toEqual([
      "branches",
      "stale",
      { olderThanDays: 30 },
    ]);
  });

  it("produces stable stale key without days", () => {
    expect(branchKeys.stale()).toEqual([
      "branches",
      "stale",
      { olderThanDays: undefined },
    ]);
  });
});
