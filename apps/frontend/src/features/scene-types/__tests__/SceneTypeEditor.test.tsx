import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { SceneTypeEditor } from "../SceneTypeEditor";
import type { CreateSceneType } from "../types";

/* --------------------------------------------------------------------------
   Mock API (required by hooks, not used directly in these tests)
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SceneTypeEditor", () => {
  const defaultProps = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders form with name input", () => {
    renderWithProviders(<SceneTypeEditor {...defaultProps} />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("disables save when name is empty", () => {
    renderWithProviders(<SceneTypeEditor {...defaultProps} />);

    const submitBtn = screen.getByRole("button", {
      name: "Create Scene Type",
    });
    expect(submitBtn).toBeDisabled();
  });

  it("calls onSave with form data when submitted", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <SceneTypeEditor {...defaultProps} onSave={onSave} />,
    );

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Close-up portrait" } });

    const submitBtn = screen.getByRole("button", {
      name: "Create Scene Type",
    });
    fireEvent.click(submitBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const firstCall = onSave.mock.calls[0] as [CreateSceneType];
    expect(firstCall[0].name).toBe("Close-up portrait");
  });
});
