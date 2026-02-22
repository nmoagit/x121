import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import {
  PromptTemplateEditor,
  type PromptTemplateValues,
} from "../PromptTemplateEditor";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const EMPTY_PROMPTS: PromptTemplateValues = {
  prompt_template: "",
  negative_prompt_template: "",
  prompt_start_clip: "",
  negative_prompt_start_clip: "",
  prompt_continuation_clip: "",
  negative_prompt_continuation_clip: "",
};

const PROMPTS_WITH_START: PromptTemplateValues = {
  ...EMPTY_PROMPTS,
  prompt_start_clip: "Custom start prompt",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PromptTemplateEditor", () => {
  it("renders clip position tabs", () => {
    renderWithProviders(
      <PromptTemplateEditor prompts={EMPTY_PROMPTS} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("tab", { name: /Full Clip/ })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Start Clip/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Continuation Clip/ }),
    ).toBeInTheDocument();
  });

  it("shows placeholder text for empty override tabs", () => {
    renderWithProviders(
      <PromptTemplateEditor prompts={EMPTY_PROMPTS} onChange={vi.fn()} />,
    );

    // Switch to Start Clip tab
    const startTab = screen.getByRole("tab", { name: /Start Clip/ });
    fireEvent.click(startTab);

    const positiveTextarea = screen.getByLabelText("Positive Prompt");
    expect(positiveTextarea).toHaveAttribute(
      "placeholder",
      expect.stringContaining("fallback"),
    );
  });

  it("calls onChange when typing in positive prompt", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <PromptTemplateEditor prompts={EMPTY_PROMPTS} onChange={onChange} />,
    );

    const positiveTextarea = screen.getByLabelText("Positive Prompt");
    fireEvent.change(positiveTextarea, {
      target: { value: "Photo of {character_name}" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const firstCall = onChange.mock.calls[0] as [PromptTemplateValues];
    expect(firstCall[0].prompt_template).toBe(
      "Photo of {character_name}",
    );
  });

  it("shows badge on tabs with custom prompts", () => {
    renderWithProviders(
      <PromptTemplateEditor
        prompts={PROMPTS_WITH_START}
        onChange={vi.fn()}
      />,
    );

    // The Start Clip tab should have a "custom" badge
    expect(screen.getByText("custom")).toBeInTheDocument();
  });
});
