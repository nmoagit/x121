/**
 * Tests for ContactSheetPage component (PRD-103).
 */

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ContactSheetPage } from "../ContactSheetPage";

/* --------------------------------------------------------------------------
   API mock
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/contact-sheet/images")) {
        return Promise.resolve([
          {
            id: 1,
            avatar_id: 10,
            scene_id: 100,
            face_crop_path: "/crops/face_001.png",
            confidence_score: 0.95,
            frame_number: 42,
            created_at: "2026-02-28T10:00:00Z",
            updated_at: "2026-02-28T10:00:00Z",
          },
          {
            id: 2,
            avatar_id: 10,
            scene_id: 101,
            face_crop_path: "/crops/face_002.png",
            confidence_score: 0.82,
            frame_number: 88,
            created_at: "2026-02-28T10:00:00Z",
            updated_at: "2026-02-28T10:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ContactSheetPage", () => {
  test("renders grid and controls", async () => {
    renderWithProviders(
      <ContactSheetPage avatarId={10} avatarName="Alice" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("contact-sheet-page")).toBeInTheDocument();
      expect(screen.getByTestId("contact-sheet-controls")).toBeInTheDocument();
      expect(screen.getByTestId("face-crop-grid")).toBeInTheDocument();
    });
  });

  test("shows image count when images are loaded", async () => {
    renderWithProviders(
      <ContactSheetPage avatarId={10} avatarName="Alice" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("image-count-badge")).toHaveTextContent("2 images");
    });
  });

  test("shows empty state when no images exist", async () => {
    vi.mocked((await import("@/lib/api")).api.get).mockResolvedValueOnce([]);

    renderWithProviders(
      <ContactSheetPage avatarId={99} avatarName="Nobody" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("face-crop-grid-empty")).toBeInTheDocument();
    });
  });
});
