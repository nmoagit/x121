/**
 * Tests for TextLabel component (PRD-70).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TextLabel } from "../TextLabel";

describe("TextLabel", () => {
  test("renders editable text input", () => {
    renderWithProviders(<TextLabel x={100} y={100} />);
    expect(screen.getByTestId("text-label")).toBeInTheDocument();
    expect(screen.getByTestId("text-input")).toBeInTheDocument();
  });

  test("renders font size selector", () => {
    renderWithProviders(<TextLabel x={100} y={100} />);
    expect(screen.getByTestId("font-size-selector")).toBeInTheDocument();
    expect(screen.getByTestId("font-size-select")).toBeInTheDocument();
  });

  test("renders color picker", () => {
    renderWithProviders(<TextLabel x={100} y={100} />);
    expect(screen.getByTestId("text-color-picker")).toBeInTheDocument();
  });

  test("shows character count", () => {
    renderWithProviders(<TextLabel x={100} y={100} initialText="Hello" />);
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });

  test("confirm button is disabled when text is empty", () => {
    renderWithProviders(<TextLabel x={100} y={100} />);
    expect(screen.getByTestId("confirm-text-button")).toBeDisabled();
  });
});
