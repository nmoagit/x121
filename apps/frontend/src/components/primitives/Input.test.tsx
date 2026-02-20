import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders with a label", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("connects label to input via htmlFor", () => {
    render(<Input label="Username" />);
    const label = screen.getByText("Username");
    const input = screen.getByRole("textbox");
    expect(label).toHaveAttribute("for", input.id);
  });

  it("uses a custom id when provided", () => {
    render(<Input label="Name" id="custom-id" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("id", "custom-id");
    expect(screen.getByText("Name")).toHaveAttribute("for", "custom-id");
  });

  it("shows an error message", () => {
    render(<Input error="This field is required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("This field is required");
  });

  it("sets aria-invalid when error is present", () => {
    render(<Input error="Invalid email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not set aria-invalid when there is no error", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("shows helper text when no error is present", () => {
    render(<Input helperText="Enter your full name" />);
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
  });

  it("hides helper text when error is present", () => {
    render(<Input helperText="Enter your email" error="Invalid email" />);
    expect(screen.queryByText("Enter your email")).not.toBeInTheDocument();
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
  });

  it("fires onChange when text is entered", () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("connects error message via aria-describedby", () => {
    render(<Input error="Required field" />);
    const input = screen.getByRole("textbox");
    const errorEl = screen.getByRole("alert");
    const describedByIds = input.getAttribute("aria-describedby");
    expect(describedByIds).toContain(errorEl.id);
  });

  it("connects helper text via aria-describedby", () => {
    render(<Input helperText="Some help" />);
    const input = screen.getByRole("textbox");
    const helperEl = screen.getByText("Some help");
    const describedByIds = input.getAttribute("aria-describedby");
    expect(describedByIds).toContain(helperEl.id);
  });

  it("applies error border class when error is present", () => {
    render(<Input error="Error" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-[var(--color-border-error)]");
  });

  it("applies default border class when no error", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-[var(--color-border-default)]");
  });

  it("forwards placeholder prop", () => {
    render(<Input placeholder="Type here..." />);
    expect(screen.getByPlaceholderText("Type here...")).toBeInTheDocument();
  });
});
