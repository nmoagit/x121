import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ApiTokenSettings } from "../ApiTokenSettings";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        service_name: "civitai",
        token_hint: "...abcd",
        is_valid: true,
        last_used_at: "2026-02-22T10:00:00Z",
      },
    ]),
    post: vi.fn().mockResolvedValue({
      service_name: "civitai",
      token_hint: "...abcd",
      is_valid: true,
      last_used_at: null,
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ApiTokenSettings", () => {
  it("renders service sections for CivitAI and HuggingFace", async () => {
    renderWithProviders(<ApiTokenSettings />);
    expect(await screen.findByText("CivitAI")).toBeInTheDocument();
    expect(screen.getByText("HuggingFace")).toBeInTheDocument();
  });

  it("shows the token hint when a token is stored", async () => {
    renderWithProviders(<ApiTokenSettings />);
    expect(await screen.findByText("...abcd")).toBeInTheDocument();
  });

  it("shows a Save button for services without stored tokens", async () => {
    renderWithProviders(<ApiTokenSettings />);
    // HuggingFace has no token, so it should show a Save button
    await screen.findByText("...abcd");
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
