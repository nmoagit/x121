import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { MidRunParamEditor } from "../MidRunParamEditor";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("MidRunParamEditor", () => {
  it("renders current parameters in the textarea", () => {
    renderWithProviders(
      <MidRunParamEditor
        currentParams={{ steps: 30, cfg_scale: 7.5 }}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue(
      JSON.stringify({ steps: 30, cfg_scale: 7.5 }, null, 2),
    );
  });

  it("allows editing JSON in the textarea", () => {
    renderWithProviders(
      <MidRunParamEditor
        currentParams={{}}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: '{ "resolution": "720p" }' },
    });

    expect(textarea).toHaveValue('{ "resolution": "720p" }');
  });

  it("shows modified parameter badges", () => {
    renderWithProviders(
      <MidRunParamEditor
        currentParams={{ steps: 30, resolution: "720p" }}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByText("steps")).toBeInTheDocument();
    expect(screen.getByText("resolution")).toBeInTheDocument();
  });

  it("calls onSave with updated params", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <MidRunParamEditor
        currentParams={{}}
        onSave={onSave}
        isSaving={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: '{ "steps": 50 }' },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Parameters" }));

    expect(onSave).toHaveBeenCalledWith({ steps: 50 });
  });
});
