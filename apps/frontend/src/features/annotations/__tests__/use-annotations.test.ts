/**
 * Tests for annotation query key factory (PRD-70).
 */

import { describe, expect, test } from "vitest";

import { annotationKeys } from "../hooks/use-annotations";

describe("annotationKeys", () => {
  test("all key is stable", () => {
    expect(annotationKeys.all).toEqual(["annotations"]);
  });

  test("bySegment includes segment id", () => {
    expect(annotationKeys.bySegment(42)).toEqual([
      "annotations",
      "segment",
      42,
    ]);
  });

  test("byFrame includes segment id and frame", () => {
    expect(annotationKeys.byFrame(42, 10)).toEqual([
      "annotations",
      "segment",
      42,
      "frame",
      10,
    ]);
  });

  test("byUser includes segment id and user id", () => {
    expect(annotationKeys.byUser(42, 5)).toEqual([
      "annotations",
      "segment",
      42,
      "user",
      5,
    ]);
  });

  test("summary includes segment id", () => {
    expect(annotationKeys.summary(42)).toEqual([
      "annotations",
      "summary",
      42,
    ]);
  });

  test("export includes segment id and frame", () => {
    expect(annotationKeys.export(42, 10)).toEqual([
      "annotations",
      "export",
      42,
      10,
    ]);
  });
});
