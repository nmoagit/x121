import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PromptEditor } from "../PromptEditor";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PromptEditor", () => {
  it("renders the prompt editor with textarea inputs", () => {
    renderWithProviders(<PromptEditor sceneTypeId={1} />);

    expect(screen.getByTestId("prompt-editor")).toBeInTheDocument();
    expect(screen.getByTestId("positive-prompt-input")).toBeInTheDocument();
    expect(screen.getByTestId("negative-prompt-input")).toBeInTheDocument();
  });

  it("displays character count for positive prompt", () => {
    renderWithProviders(
      <PromptEditor sceneTypeId={1} initialPositive="hello world" />,
    );

    const charCount = screen.getByTestId("positive-char-count");
    expect(charCount.textContent).toContain("11/10000 chars");
  });

  it("shows change notes input", () => {
    renderWithProviders(<PromptEditor sceneTypeId={1} />);

    expect(screen.getByTestId("change-notes-input")).toBeInTheDocument();
  });

  it("triggers onSave when save button is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <PromptEditor
        sceneTypeId={1}
        initialPositive="test prompt"
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("save-prompt-btn"));
    expect(onSave).toHaveBeenCalledWith({
      positive_prompt: "test prompt",
      negative_prompt: null,
      change_notes: null,
    });
  });

  it("disables save button when positive prompt is empty", () => {
    renderWithProviders(<PromptEditor sceneTypeId={1} />);

    expect(screen.getByTestId("save-prompt-btn")).toBeDisabled();
  });

  it("shows placeholder preview when placeholders are present", () => {
    renderWithProviders(
      <PromptEditor
        sceneTypeId={1}
        initialPositive="A {style} photo of {subject}"
      />,
    );

    expect(screen.getByTestId("placeholder-preview")).toBeInTheDocument();
  });
});
