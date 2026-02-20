import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies default variant styling", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-[var(--color-surface-tertiary)]");
    expect(badge.className).toContain("text-[var(--color-text-secondary)]");
  });

  it("applies success variant styling", () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText("Success");
    expect(badge.className).toContain("text-[var(--color-action-success)]");
  });

  it("applies warning variant styling", () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText("Warning");
    expect(badge.className).toContain("text-[var(--color-action-warning)]");
  });

  it("applies danger variant styling", () => {
    render(<Badge variant="danger">Error</Badge>);
    const badge = screen.getByText("Error");
    expect(badge.className).toContain("text-[var(--color-action-danger)]");
  });

  it("applies info variant styling", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge.className).toContain("text-[var(--color-action-primary)]");
  });

  it("applies sm size classes", () => {
    render(<Badge size="sm">Small</Badge>);
    const badge = screen.getByText("Small");
    expect(badge.className).toContain("text-xs");
  });

  it("applies md size classes by default", () => {
    render(<Badge>Medium</Badge>);
    const badge = screen.getByText("Medium");
    expect(badge.className).toContain("text-sm");
  });

  it("renders as an inline-flex span element", () => {
    render(<Badge>Tag</Badge>);
    const badge = screen.getByText("Tag");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.className).toContain("inline-flex");
  });

  it("applies rounded-full for pill shape", () => {
    render(<Badge>Pill</Badge>);
    const badge = screen.getByText("Pill");
    expect(badge.className).toContain("rounded-[var(--radius-full)]");
  });
});
