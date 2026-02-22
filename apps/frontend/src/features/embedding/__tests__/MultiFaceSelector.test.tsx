import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { MultiFaceSelector } from "../MultiFaceSelector";
import type { DetectedFace } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_FACE_1: DetectedFace = {
  id: 1,
  character_id: 10,
  bounding_box: { x: 50, y: 50, width: 100, height: 120 },
  confidence: 0.95,
  is_primary: true,
  created_at: "2026-02-21T00:00:00Z",
  updated_at: "2026-02-21T00:00:00Z",
};

const MOCK_FACE_2: DetectedFace = {
  id: 2,
  character_id: 10,
  bounding_box: { x: 200, y: 60, width: 90, height: 110 },
  confidence: 0.72,
  is_primary: false,
  created_at: "2026-02-21T00:00:00Z",
  updated_at: "2026-02-21T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("MultiFaceSelector", () => {
  it("renders all detected faces in the list", () => {
    const onSelectFace = vi.fn();
    renderWithProviders(
      <MultiFaceSelector
        faces={[MOCK_FACE_1, MOCK_FACE_2]}
        imageWidth={512}
        imageHeight={768}
        onSelectFace={onSelectFace}
      />,
    );

    expect(screen.getByText(/Face 1/)).toBeInTheDocument();
    expect(screen.getByText(/Face 2/)).toBeInTheDocument();
  });

  it("calls onSelectFace when a face list item is clicked", () => {
    const onSelectFace = vi.fn();
    renderWithProviders(
      <MultiFaceSelector
        faces={[MOCK_FACE_1, MOCK_FACE_2]}
        imageWidth={512}
        imageHeight={768}
        onSelectFace={onSelectFace}
      />,
    );

    const faceBtn = screen.getByRole("button", { name: "Select face 2" });
    fireEvent.click(faceBtn);

    expect(onSelectFace).toHaveBeenCalledWith(2);
  });

  it("shows confidence percentage for each face", () => {
    const onSelectFace = vi.fn();
    renderWithProviders(
      <MultiFaceSelector
        faces={[MOCK_FACE_1, MOCK_FACE_2]}
        imageWidth={512}
        imageHeight={768}
        onSelectFace={onSelectFace}
      />,
    );

    expect(screen.getByText("95.0%")).toBeInTheDocument();
    expect(screen.getByText("72.0%")).toBeInTheDocument();
  });

  it("shows empty state when no faces are provided", () => {
    const onSelectFace = vi.fn();
    renderWithProviders(
      <MultiFaceSelector
        faces={[]}
        imageWidth={512}
        imageHeight={768}
        onSelectFace={onSelectFace}
      />,
    );

    expect(screen.getByText(/No faces detected/)).toBeInTheDocument();
  });
});
