/**
 * Tests for ReviewThread component (PRD-38).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReviewThread } from "../ReviewThread";
import type { ReviewNote } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const rootNote: ReviewNote = {
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
};

const resolvedNote: ReviewNote = {
  ...rootNote,
  id: 10,
  status: "resolved",
};

const replies: ReviewNote[] = [
  {
    id: 2,
    segment_id: 10,
    user_id: 101,
    parent_note_id: 1,
    timecode: null,
    frame_number: null,
    text_content: "I can reproduce this, will fix",
    voice_memo_path: null,
    voice_memo_transcript: null,
    status: "open",
    created_at: "2026-02-20T11:00:00Z",
    updated_at: "2026-02-20T11:00:00Z",
  },
  {
    id: 3,
    segment_id: 10,
    user_id: 100,
    parent_note_id: 1,
    timecode: null,
    frame_number: null,
    text_content: "Thanks, let me know when done",
    voice_memo_path: null,
    voice_memo_transcript: null,
    status: "open",
    created_at: "2026-02-20T12:00:00Z",
    updated_at: "2026-02-20T12:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReviewThread", () => {
  test("renders threaded replies", () => {
    renderWithProviders(
      <ReviewThread note={rootNote} replies={replies} />,
    );

    expect(screen.getByTestId("review-thread")).toBeInTheDocument();
    expect(screen.getByTestId("thread-root-text")).toHaveTextContent(
      "Face melting issue at this frame",
    );
    expect(screen.getByTestId("thread-reply-2")).toBeInTheDocument();
    expect(screen.getByTestId("thread-reply-3")).toBeInTheDocument();
    expect(
      screen.getByText("I can reproduce this, will fix"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Thanks, let me know when done"),
    ).toBeInTheDocument();
  });

  test("shows resolution status", () => {
    renderWithProviders(
      <ReviewThread note={resolvedNote} replies={[]} />,
    );

    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  test("allows replying to notes", () => {
    const onReply = vi.fn();
    renderWithProviders(
      <ReviewThread note={rootNote} replies={replies} onReply={onReply} />,
    );

    const input = screen.getByTestId("thread-reply-input");
    fireEvent.change(input, { target: { value: "Great fix!" } });
    fireEvent.click(screen.getByRole("button", { name: /reply/i }));

    expect(onReply).toHaveBeenCalledWith("Great fix!");
  });

  test("collapses and expands thread", () => {
    renderWithProviders(
      <ReviewThread
        note={rootNote}
        replies={replies}
        defaultCollapsed
      />,
    );

    // Initially collapsed: replies not visible.
    expect(screen.queryByTestId("thread-replies")).not.toBeInTheDocument();

    // Expand.
    fireEvent.click(
      screen.getByRole("button", { name: /expand thread/i }),
    );
    expect(screen.getByTestId("thread-replies")).toBeInTheDocument();

    // Collapse again.
    fireEvent.click(
      screen.getByRole("button", { name: /collapse thread/i }),
    );
    expect(screen.queryByTestId("thread-replies")).not.toBeInTheDocument();
  });
});
