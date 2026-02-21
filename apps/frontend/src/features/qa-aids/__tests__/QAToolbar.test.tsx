import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QAToolbar } from "../QAToolbar";
import type { QAToolbarState } from "../QAToolbar";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function defaultState(overrides: Partial<QAToolbarState> = {}): QAToolbarState {
  return {
    ghostingEnabled: false,
    ghostMode: "previous",
    ghostOpacity: 0.5,
    roiEnabled: false,
    roiMagnification: 2,
    jogDialEnabled: false,
    audioScrubEnabled: false,
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   QAToolbar Tests
   -------------------------------------------------------------------------- */

describe("QAToolbar", () => {
  it("renders the toolbar with all tool toggle buttons", () => {
    const state = defaultState();
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    expect(screen.getByText("QA Tools")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ROI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scrub" })).toBeInTheDocument();
  });

  it("toggles ghosting when Ghost button is clicked", () => {
    const state = defaultState();
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Ghost" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ghostingEnabled: true }),
    );
  });

  it("shows opacity presets when ghosting is enabled", () => {
    const state = defaultState({ ghostingEnabled: true });
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    expect(screen.getByLabelText("25% opacity")).toBeInTheDocument();
    expect(screen.getByLabelText("50% opacity")).toBeInTheDocument();
    expect(screen.getByLabelText("75% opacity")).toBeInTheDocument();
  });

  it("hides opacity presets when ghosting is disabled", () => {
    const state = defaultState({ ghostingEnabled: false });
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    expect(screen.queryByLabelText("25% opacity")).not.toBeInTheDocument();
  });

  it("changes ghost opacity when a preset is clicked", () => {
    const state = defaultState({ ghostingEnabled: true, ghostOpacity: 0.5 });
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByLabelText("75% opacity"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ghostOpacity: 0.75 }),
    );
  });

  it("toggles ghost mode between previous and next", () => {
    const state = defaultState({ ghostingEnabled: true, ghostMode: "previous" });
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByText("Next"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ghostMode: "next" }),
    );
  });

  it("shows magnification presets when ROI is enabled", () => {
    const state = defaultState({ roiEnabled: true });
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    expect(screen.getByLabelText("2x magnification")).toBeInTheDocument();
    expect(screen.getByLabelText("4x magnification")).toBeInTheDocument();
    expect(screen.getByLabelText("8x magnification")).toBeInTheDocument();
  });

  it("changes magnification when a preset is clicked", () => {
    const state = defaultState({ roiEnabled: true, roiMagnification: 2 });
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByLabelText("8x magnification"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ roiMagnification: 8 }),
    );
  });

  it("toggles ROI when ROI button is clicked", () => {
    const state = defaultState();
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "ROI" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ roiEnabled: true }),
    );
  });

  it("toggles jog dial when Jog button is clicked", () => {
    const state = defaultState();
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Jog" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ jogDialEnabled: true }),
    );
  });

  it("toggles audio scrub when Scrub button is clicked", () => {
    const state = defaultState();
    const onChange = vi.fn();
    render(<QAToolbar state={state} onStateChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Scrub" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ audioScrubEnabled: true }),
    );
  });

  it("collapses the toolbar when collapse button is clicked", () => {
    const state = defaultState();
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    // All tools should be visible initially.
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();

    // Click collapse.
    fireEvent.click(screen.getByLabelText("Collapse QA toolbar"));

    // Tools should be hidden.
    expect(screen.queryByRole("button", { name: "Ghost" })).not.toBeInTheDocument();
  });

  it("expands the toolbar when expand button is clicked", () => {
    const state = defaultState();
    render(<QAToolbar state={state} onStateChange={vi.fn()} />);

    // Collapse first.
    fireEvent.click(screen.getByLabelText("Collapse QA toolbar"));
    expect(screen.queryByRole("button", { name: "Ghost" })).not.toBeInTheDocument();

    // Expand.
    fireEvent.click(screen.getByLabelText("Expand QA toolbar"));
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
  });

  it("applies the correct position class for bottom", () => {
    const state = defaultState();
    render(<QAToolbar state={state} onStateChange={vi.fn()} position="bottom" />);

    const toolbar = screen.getByTestId("qa-toolbar");
    expect(toolbar.className).toContain("bottom-2");
  });

  it("applies the correct position class for top", () => {
    const state = defaultState();
    render(<QAToolbar state={state} onStateChange={vi.fn()} position="top" />);

    const toolbar = screen.getByTestId("qa-toolbar");
    expect(toolbar.className).toContain("top-2");
  });
});
