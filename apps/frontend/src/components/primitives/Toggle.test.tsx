import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("renders with role='switch'", () => {
    render(<Toggle />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("has aria-checked='false' when unchecked (default)", () => {
    render(<Toggle />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("has aria-checked='true' when checked", () => {
    render(<Toggle checked />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("fires onChange with true when toggling on", () => {
    const handleChange = vi.fn();
    render(<Toggle onChange={handleChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it("fires onChange with false when toggling off", () => {
    const handleChange = vi.fn();
    render(<Toggle checked onChange={handleChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it("shows label text", () => {
    render(<Toggle label="Dark mode" />);
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Toggle disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("does not fire onChange when disabled", () => {
    const handleChange = vi.fn();
    render(<Toggle disabled onChange={handleChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("applies active track color when checked", () => {
    render(<Toggle checked />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("bg-[var(--color-action-primary)]");
  });

  it("applies inactive track color when unchecked", () => {
    render(<Toggle />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("bg-[var(--color-surface-tertiary)]");
  });

  it("applies sm size classes when size='sm'", () => {
    render(<Toggle size="sm" />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("w-8");
  });

  it("applies md size classes by default", () => {
    render(<Toggle />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("w-11");
  });
});
