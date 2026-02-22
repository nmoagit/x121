/**
 * Tests for NoteTimeline component (PRD-38).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { NoteTimeline } from "../NoteTimeline";
import type { ReviewNote, ReviewTag } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockNotes: ReviewNote[] = [
  {
    id: 1,
    segment_id: 10,
    user_id: 100,
    parent_note_id: null,
    timecode: "01:02:03:04",
    frame_number: null,
    text_content: "Face melting issue at this frame",
    voice_memo_path: null,
    voice_memo_transcript: null,
    status: "open",
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    segment_id: 10,
    user_id: 101,
    parent_note_id: null,
    timecode: null,
    frame_number: 150,
    text_content: "Lighting looks great here",
    voice_memo_path: null,
    voice_memo_transcript: null,
    status: "resolved",
    created_at: "2026-02-20T11:00:00Z",
    updated_at: "2026-02-20T11:30:00Z",
  },
];

const mockTags: ReviewTag[] = [
  {
    id: 1,
    name: "Face Melt",
    color: "#FF4444",
    category: "face",
    created_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("NoteTimeline", () => {
  test("renders notes for a segment", () => {
    renderWithProviders(
      <NoteTimeline notes={mockNotes} tags={mockTags} />,
    );

    expect(screen.getByTestId("note-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("note-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("note-item-2")).toBeInTheDocument();
  });

  test("shows timecode and text content", () => {
    renderWithProviders(
      <NoteTimeline notes={mockNotes} tags={mockTags} />,
    );

    expect(screen.getByTestId("note-timecode-1")).toHaveTextContent(
      "01:02:03:04",
    );
    expect(screen.getByTestId("note-text-1")).toHaveTextContent(
      "Face melting issue at this frame",
    );
    expect(screen.getByTestId("note-text-2")).toHaveTextContent(
      "Lighting looks great here",
    );
  });

  test("displays tag badges on notes", () => {
    renderWithProviders(
      <NoteTimeline notes={mockNotes} tags={mockTags} />,
    );

    // Tags container should be present for each note.
    expect(screen.getByTestId("note-tags-1")).toBeInTheDocument();
    expect(screen.getByTestId("note-tags-2")).toBeInTheDocument();
  });

  test("shows resolution status", () => {
    renderWithProviders(
      <NoteTimeline notes={mockNotes} tags={mockTags} />,
    );

    // First note is open, second is resolved.
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });
});
