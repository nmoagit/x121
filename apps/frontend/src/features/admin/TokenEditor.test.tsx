import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenEditor } from "./TokenEditor";

// Mock the api module so we don't make real HTTP requests in tests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 1, name: "Test", tokens: {} }),
    put: vi.fn().mockResolvedValue({ id: 1, name: "Test", tokens: {} }),
  },
}));

describe("TokenEditor", () => {
  it("renders without crashing and shows the theme list header", async () => {
    render(<TokenEditor />);

    await waitFor(() => {
      expect(screen.getByText("Themes")).toBeInTheDocument();
    });
  });

  it("shows the New button for creating themes", async () => {
    render(<TokenEditor />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    });
  });

  it("shows the Create Theme button when no theme is selected", async () => {
    render(<TokenEditor />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Theme" })).toBeInTheDocument();
    });
  });

  it("renders token editor tabs", async () => {
    render(<TokenEditor />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Surface" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Text" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Action" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Border" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Font" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Spacing" })).toBeInTheDocument();
    });
  });

  it("renders the live preview panel", async () => {
    render(<TokenEditor />);

    await waitFor(() => {
      expect(screen.getByText("Live Preview")).toBeInTheDocument();
    });
  });
});
