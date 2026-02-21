import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ImportProgress } from "../ImportProgress";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ImportProgress", () => {
  it("shows spinner when committing", () => {
    renderWithProviders(
      <ImportProgress isCommitting={true} result={null} />,
    );
    expect(screen.getByText("Committing import...")).toBeInTheDocument();
  });

  it("renders nothing when not committing and no result", () => {
    const { container } = renderWithProviders(
      <ImportProgress isCommitting={false} result={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows results when commit is complete", () => {
    renderWithProviders(
      <ImportProgress
        isCommitting={false}
        result={{ created: 5, updated: 2, skipped: 1, failed: 0 }}
      />,
    );

    expect(screen.getByText("Import Complete")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows total processed count", () => {
    renderWithProviders(
      <ImportProgress
        isCommitting={false}
        result={{ created: 3, updated: 1, skipped: 0, failed: 0 }}
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument(); // total = 3 + 1 + 0 + 0
  });

  it("has the test id", () => {
    renderWithProviders(
      <ImportProgress
        isCommitting={false}
        result={{ created: 1, updated: 0, skipped: 0, failed: 0 }}
      />,
    );

    expect(screen.getByTestId("import-progress")).toBeInTheDocument();
  });
});
