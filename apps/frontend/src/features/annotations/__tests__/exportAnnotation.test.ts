/**
 * Tests for exportAnnotatedFrame utility (PRD-70).
 */

import { describe, expect, test } from "vitest";

import { exportAnnotatedFrame } from "../exportAnnotation";
import type { DrawingObject } from "../types";

describe("exportAnnotatedFrame", () => {
  test("creates canvas with correct dimensions", () => {
    const canvas = exportAnnotatedFrame([], 1920, 1080);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });

  test("returns canvas element for empty annotations", () => {
    const canvas = exportAnnotatedFrame([], 800, 600);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  test("processes pen annotations", () => {
    const annotations: DrawingObject[] = [
      {
        tool: "pen",
        data: { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
        color: "#FF0000",
        strokeWidth: 2,
      },
    ];
    const canvas = exportAnnotatedFrame(annotations, 800, 600);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  test("processes circle annotations", () => {
    const annotations: DrawingObject[] = [
      {
        tool: "circle",
        data: { startX: 50, startY: 50, endX: 150, endY: 150 },
        color: "#0000FF",
        strokeWidth: 3,
      },
    ];
    const canvas = exportAnnotatedFrame(annotations, 800, 600);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  test("processes text annotations", () => {
    const annotations: DrawingObject[] = [
      {
        tool: "text",
        data: { x: 100, y: 100, content: "Note", fontSize: 16 },
        color: "#000000",
        strokeWidth: 0,
      },
    ];
    const canvas = exportAnnotatedFrame(annotations, 800, 600);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });
});
