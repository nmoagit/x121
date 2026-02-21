import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { BugReportForm } from "../BugReportForm";

// Mock the api module.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 1,
      description: "Test bug",
      url: "http://localhost/",
      browser_info: "test-browser",
      console_errors_json: null,
      action_history_json: null,
      context_json: null,
      recording_path: null,
      screenshot_path: null,
      status: "new",
      created_at: "2026-02-21T10:00:00Z",
      updated_at: "2026-02-21T10:00:00Z",
    }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("BugReportForm", () => {
  const onClose = vi.fn();

  it("renders the form with description field", () => {
    renderWithProviders(<BugReportForm onClose={onClose} />);

    expect(screen.getByText("Report a Bug")).toBeInTheDocument();
    expect(screen.getByLabelText("What went wrong?")).toBeInTheDocument();
    expect(screen.getByText("Submit Report")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("captures browser context automatically", () => {
    renderWithProviders(<BugReportForm onClose={onClose} />);

    // Should show the auto-captured context section.
    expect(screen.getByText("Context (auto-captured)")).toBeInTheDocument();
    // URL should be visible in the context block.
    expect(screen.getByText(/URL:/)).toBeInTheDocument();
    expect(screen.getByText(/Browser:/)).toBeInTheDocument();
  });

  it("submits the form and shows success message", async () => {
    renderWithProviders(<BugReportForm onClose={onClose} />);

    const textarea = screen.getByLabelText("What went wrong?");
    fireEvent.change(textarea, { target: { value: "Something is broken" } });

    const submitBtn = screen.getByText("Submit Report");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Bug report submitted successfully!")).toBeInTheDocument();
    });
  });

  it("calls onClose when cancel is clicked", () => {
    renderWithProviders(<BugReportForm onClose={onClose} />);

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
