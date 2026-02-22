import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { AbortDialog } from "../AbortDialog";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("AbortDialog", () => {
  it("shows confirmation dialog", () => {
    renderWithProviders(
      <AbortDialog
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isAborting={false}
      />,
    );

    expect(screen.getByText("Abort Job")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to abort this job/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Abort" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  it("accepts optional abort reason", () => {
    renderWithProviders(
      <AbortDialog
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isAborting={false}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Why are you aborting this job?",
    );
    fireEvent.change(textarea, {
      target: { value: "Wrong parameters used" },
    });

    expect(textarea).toHaveValue("Wrong parameters used");
  });

  it("calls onConfirm with reason", () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <AbortDialog
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isAborting={false}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Why are you aborting this job?",
    );
    fireEvent.change(textarea, {
      target: { value: "Wrong parameters used" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));

    expect(onConfirm).toHaveBeenCalledWith("Wrong parameters used");
  });
});
