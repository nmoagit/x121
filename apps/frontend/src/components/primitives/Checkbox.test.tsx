import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("renders checked when checked prop is true", () => {
    render(<Checkbox checked />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("shows label text", () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByText("Accept terms")).toBeInTheDocument();
  });

  it("connects label to checkbox via htmlFor", () => {
    render(<Checkbox label="Remember me" />);
    const checkbox = screen.getByRole("checkbox");
    // The wrapping <label> has htmlFor matching the input id
    const label = checkbox.closest("label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute("for", checkbox.id);
  });

  it("fires onChange when clicked", () => {
    const handleChange = vi.fn();
    render(<Checkbox onChange={handleChange} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it("fires onChange with false when unchecking", () => {
    const handleChange = vi.fn();
    render(<Checkbox checked onChange={handleChange} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it("sets aria-checked to mixed for indeterminate state", () => {
    render(<Checkbox indeterminate />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
  });

  it("sets aria-checked to true when checked", () => {
    render(<Checkbox checked />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("sets aria-checked to false when unchecked", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("is disabled when disabled prop is true", () => {
    render(<Checkbox disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("applies disabled styling to the wrapper label", () => {
    render(<Checkbox disabled label="Disabled option" />);
    const checkbox = screen.getByRole("checkbox");
    const label = checkbox.closest("label");
    expect(label?.className).toContain("opacity-50");
    expect(label?.className).toContain("cursor-not-allowed");
  });

  it("sets the native indeterminate property on the input", () => {
    render(<Checkbox indeterminate />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
  });
});
