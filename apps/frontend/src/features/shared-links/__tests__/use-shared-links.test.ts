/**
 * Tests for shared-links TanStack Query hooks (PRD-84).
 */

import { describe, expect, it } from "vitest";

import { sharedLinkKeys } from "../hooks/use-shared-links";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

describe("sharedLinkKeys", () => {
  it("produces correct base key", () => {
    expect(sharedLinkKeys.all).toEqual(["shared-links"]);
  });

  it("produces correct list key", () => {
    expect(sharedLinkKeys.list()).toEqual(["shared-links", "list"]);
  });

  it("produces correct detail key", () => {
    expect(sharedLinkKeys.detail(42)).toEqual([
      "shared-links",
      "detail",
      42,
    ]);
  });

  it("produces correct activity key", () => {
    expect(sharedLinkKeys.activity(7)).toEqual([
      "shared-links",
      "activity",
      7,
    ]);
  });

  it("produces correct review key", () => {
    expect(sharedLinkKeys.review("abc123")).toEqual(["review", "abc123"]);
  });

  it("detail keys share a common parent", () => {
    const key1 = sharedLinkKeys.detail(1);
    const key2 = sharedLinkKeys.detail(2);
    // First two segments should be the same
    expect(key1.slice(0, 2)).toEqual(key2.slice(0, 2));
  });

  it("activity keys share a common parent", () => {
    const key1 = sharedLinkKeys.activity(1);
    const key2 = sharedLinkKeys.activity(2);
    expect(key1.slice(0, 2)).toEqual(key2.slice(0, 2));
  });
});
