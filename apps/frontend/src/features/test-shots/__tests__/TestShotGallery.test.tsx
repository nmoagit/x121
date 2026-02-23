import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TestShotGallery } from "../TestShotGallery";
import type { TestShot } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeShot = (overrides: Partial<TestShot> = {}): TestShot => ({
  id: 1,
  scene_type_id: 10,
  character_id: 100,
  workflow_id: null,
  parameters: { strength: 0.8 },
  seed_image_path: "/images/seed.png",
  output_video_path: "/videos/output.mp4",
  last_frame_path: "/images/last_frame.png",
  duration_secs: 3.0,
  quality_score: 0.85,
  is_promoted: false,
  promoted_to_scene_id: null,
  created_by_id: 1,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const testShots: TestShot[] = [
  makeShot({ id: 1, character_id: 100, quality_score: 0.85 }),
  makeShot({ id: 2, character_id: 200, quality_score: 0.92 }),
  makeShot({
    id: 3,
    character_id: 100,
    is_promoted: true,
    promoted_to_scene_id: 50,
    quality_score: 0.78,
  }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TestShotGallery", () => {
  it("renders the gallery container with test shot cards", () => {
    renderWithProviders(
      <TestShotGallery testShots={testShots} />,
    );

    expect(screen.getByTestId("test-shot-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("test-shot-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-shot-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("test-shot-card-3")).toBeInTheDocument();
  });

  it("shows empty state when no test shots provided", () => {
    renderWithProviders(<TestShotGallery testShots={[]} />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("No test shots yet. Generate one to get started."),
    ).toBeInTheDocument();
  });

  it("filters by character when character filter is changed", () => {
    renderWithProviders(
      <TestShotGallery testShots={testShots} />,
    );

    const filter = screen.getByTestId("character-filter");
    fireEvent.change(filter, { target: { value: "200" } });

    // Only character 200 shots should be visible.
    expect(screen.queryByTestId("test-shot-card-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("test-shot-card-2")).toBeInTheDocument();
    expect(screen.queryByTestId("test-shot-card-3")).not.toBeInTheDocument();
  });

  it("shows promoted badge on promoted shots", () => {
    renderWithProviders(
      <TestShotGallery testShots={testShots} />,
    );

    // Shot 3 is promoted -- status badge AND promoted badge both render.
    const promotedBadges = screen.getAllByText("Promoted");
    expect(promotedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("displays quality score as a percentage", () => {
    renderWithProviders(
      <TestShotGallery testShots={testShots} />,
    );

    // 0.85 => 85%, 0.92 => 92%, 0.78 => 78%
    expect(screen.getByTestId("quality-score-1")).toHaveTextContent("85%");
    expect(screen.getByTestId("quality-score-2")).toHaveTextContent("92%");
    expect(screen.getByTestId("quality-score-3")).toHaveTextContent("78%");
  });

  it("shows promote button only for non-promoted shots", () => {
    const onPromote = vi.fn();
    renderWithProviders(
      <TestShotGallery testShots={testShots} onPromote={onPromote} />,
    );

    // Shots 1 and 2 should have promote buttons.
    expect(screen.getByTestId("promote-btn-1")).toBeInTheDocument();
    expect(screen.getByTestId("promote-btn-2")).toBeInTheDocument();
    // Shot 3 is already promoted -- no promote button.
    expect(screen.queryByTestId("promote-btn-3")).not.toBeInTheDocument();
  });

  it("calls onPromote with shot id when promote is clicked", () => {
    const onPromote = vi.fn();
    renderWithProviders(
      <TestShotGallery testShots={testShots} onPromote={onPromote} />,
    );

    fireEvent.click(screen.getByTestId("promote-btn-1"));
    expect(onPromote).toHaveBeenCalledWith(1);
  });

  it("calls onDelete with shot id when delete is clicked", () => {
    const onDelete = vi.fn();
    renderWithProviders(
      <TestShotGallery testShots={testShots} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId("delete-btn-2"));
    expect(onDelete).toHaveBeenCalledWith(2);
  });
});
