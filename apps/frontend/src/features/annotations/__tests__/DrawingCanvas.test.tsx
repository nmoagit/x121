/**
 * Tests for DrawingCanvas component (PRD-70).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DrawingCanvas } from "../DrawingCanvas";

describe("DrawingCanvas", () => {
  test("renders with tool selector", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("drawing-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("tool-selector")).toBeInTheDocument();
  });

  test("renders all tool buttons", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("tool-pen")).toBeInTheDocument();
    expect(screen.getByTestId("tool-circle")).toBeInTheDocument();
    expect(screen.getByTestId("tool-rectangle")).toBeInTheDocument();
    expect(screen.getByTestId("tool-arrow")).toBeInTheDocument();
    expect(screen.getByTestId("tool-highlight")).toBeInTheDocument();
    expect(screen.getByTestId("tool-text")).toBeInTheDocument();
  });

  test("renders color picker", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("color-picker")).toBeInTheDocument();
    expect(screen.getByTestId("color-input")).toBeInTheDocument();
  });

  test("renders stroke width slider", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("stroke-width")).toBeInTheDocument();
    expect(screen.getByTestId("stroke-width-slider")).toBeInTheDocument();
  });

  test("renders undo and redo buttons", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("undo-button")).toBeInTheDocument();
    expect(screen.getByTestId("redo-button")).toBeInTheDocument();
  });

  test("renders canvas element", () => {
    renderWithProviders(<DrawingCanvas width={800} height={600} />);
    expect(screen.getByTestId("annotation-canvas")).toBeInTheDocument();
  });

  test("hides toolbar when not editable", () => {
    renderWithProviders(
      <DrawingCanvas width={800} height={600} editable={false} />,
    );
    expect(screen.queryByTestId("tool-selector")).not.toBeInTheDocument();
  });

  test("shows annotation count", () => {
    renderWithProviders(
      <DrawingCanvas
        width={800}
        height={600}
        existingAnnotations={[
          { tool: "pen", data: {}, color: "#FF0000", strokeWidth: 2 },
        ]}
      />,
    );
    expect(screen.getByText("1 annotation")).toBeInTheDocument();
  });
});
