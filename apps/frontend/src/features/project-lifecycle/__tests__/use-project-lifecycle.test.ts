/**
 * Tests for project lifecycle query key factory (PRD-72).
 */

import { describe, expect, it } from "vitest";

import { lifecycleKeys } from "../hooks/use-project-lifecycle";

/* --------------------------------------------------------------------------
   Query Key Factory Tests
   -------------------------------------------------------------------------- */

describe("lifecycleKeys", () => {
  it("produces stable all key", () => {
    expect(lifecycleKeys.all).toEqual(["project-lifecycle"]);
  });

  it("produces stable checklist key", () => {
    expect(lifecycleKeys.checklist(42)).toEqual([
      "project-lifecycle",
      "checklist",
      42,
    ]);
  });

  it("produces stable summary key", () => {
    expect(lifecycleKeys.summary(7)).toEqual([
      "project-lifecycle",
      "summary",
      7,
    ]);
  });

  it("produces distinct keys for different project IDs", () => {
    const a = lifecycleKeys.checklist(1);
    const b = lifecycleKeys.checklist(2);
    expect(a).not.toEqual(b);
  });
});
