import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { NoteEditor } from "../NoteEditor";
import { NotesPanel } from "../NotesPanel";
import { NoteThread } from "../NoteThread";
import { PinnedNoteBanner } from "../PinnedNoteBanner";
import { VisibilitySelector } from "../VisibilitySelector";
import { productionNoteKeys } from "../hooks/use-production-notes";
import type { NoteCategory, ProductionNote } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeCategory = (overrides: Partial<NoteCategory> = {}): NoteCategory => ({
  id: 1,
  name: "instruction",
  color: "#4488FF",
  icon: "book-open",
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const makeNote = (overrides: Partial<ProductionNote> = {}): ProductionNote => ({
  id: 1,
  entity_type: "scene",
  entity_id: 10,
  user_id: 1,
  content_md: "Test note content",
  category_id: 1,
  visibility: "team",
  pinned: false,
  parent_note_id: null,
  resolved_at: null,
  resolved_by: null,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const categories: NoteCategory[] = [
  makeCategory({ id: 1, name: "instruction", color: "#4488FF" }),
  makeCategory({ id: 2, name: "blocker", color: "#FF4444" }),
  makeCategory({ id: 3, name: "fyi", color: "#44CC88" }),
  makeCategory({ id: 4, name: "custom", color: "#888888" }),
];

const notes: ProductionNote[] = [
  makeNote({ id: 1, category_id: 1, content_md: "Instruction note" }),
  makeNote({
    id: 2,
    category_id: 2,
    content_md: "Blocker note",
    pinned: true,
  }),
  makeNote({
    id: 3,
    category_id: 3,
    content_md: "FYI note",
    resolved_at: "2026-02-23T12:00:00Z",
  }),
];

/* --------------------------------------------------------------------------
   NoteEditor tests
   -------------------------------------------------------------------------- */

describe("NoteEditor", () => {
  it("renders with category selector", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <NoteEditor
        categories={categories}
        entityType="scene"
        entityId={10}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("note-editor")).toBeInTheDocument();
    expect(screen.getByTestId("category-selector")).toBeInTheDocument();
  });

  it("visibility selector works", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <NoteEditor
        categories={categories}
        entityType="scene"
        entityId={10}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("visibility-selector")).toBeInTheDocument();
  });

  it("detects @mentions", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <NoteEditor
        categories={categories}
        entityType="scene"
        entityId={10}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const textarea = screen.getByTestId("note-content");
    fireEvent.change(textarea, {
      target: { value: "Hey @alice, please review" },
    });

    expect(screen.getByTestId("mentions-indicator")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("save button disabled when content is empty", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <NoteEditor
        categories={categories}
        entityType="scene"
        entityId={10}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const saveBtn = screen.getByTestId("save-btn");
    expect(saveBtn).toBeDisabled();
  });
});

/* --------------------------------------------------------------------------
   NotesPanel tests
   -------------------------------------------------------------------------- */

describe("NotesPanel", () => {
  it("lists notes grouped by category", () => {
    renderWithProviders(
      <NotesPanel notes={notes} categories={categories} />,
    );

    expect(screen.getByTestId("notes-list")).toBeInTheDocument();
    expect(screen.getByTestId("note-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("note-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("note-item-3")).toBeInTheDocument();
  });

  it("shows note count in header", () => {
    renderWithProviders(
      <NotesPanel notes={notes} categories={categories} />,
    );

    expect(screen.getByText("Notes (3)")).toBeInTheDocument();
  });

  it("shows category badges", () => {
    renderWithProviders(
      <NotesPanel notes={notes} categories={categories} />,
    );

    expect(screen.getByTestId("category-badge-1")).toBeInTheDocument();
    expect(screen.getByTestId("category-badge-2")).toBeInTheDocument();
  });

  it("shows empty state when no notes", () => {
    renderWithProviders(
      <NotesPanel notes={[]} categories={categories} />,
    );

    expect(screen.getByTestId("empty-notes")).toBeInTheDocument();
  });

  it("shows pinned badge for pinned notes", () => {
    renderWithProviders(
      <NotesPanel notes={notes} categories={categories} />,
    );

    expect(screen.getByTestId("pinned-badge-2")).toBeInTheDocument();
    expect(screen.queryByTestId("pinned-badge-1")).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   PinnedNoteBanner tests
   -------------------------------------------------------------------------- */

describe("PinnedNoteBanner", () => {
  const pinnedNotes = [
    makeNote({ id: 10, pinned: true, category_id: 1, content_md: "Pinned instruction" }),
    makeNote({ id: 11, pinned: true, category_id: 2, content_md: "Pinned blocker" }),
  ];

  it("shows pinned notes", () => {
    renderWithProviders(
      <PinnedNoteBanner notes={pinnedNotes} categories={categories} />,
    );

    expect(screen.getByTestId("pinned-banner")).toBeInTheDocument();
    expect(screen.getByTestId("pinned-note-10")).toBeInTheDocument();
    expect(screen.getByTestId("pinned-note-11")).toBeInTheDocument();
  });

  it("applies red treatment for blocker category", () => {
    renderWithProviders(
      <PinnedNoteBanner notes={pinnedNotes} categories={categories} />,
    );

    const blockerNote = screen.getByTestId("pinned-note-11");
    expect(blockerNote.className).toContain("border-[var(--color-action-danger)]");
  });

  it("dismiss button hides the note", () => {
    renderWithProviders(
      <PinnedNoteBanner notes={pinnedNotes} categories={categories} />,
    );

    fireEvent.click(screen.getByTestId("dismiss-btn-10"));
    expect(screen.queryByTestId("pinned-note-10")).not.toBeInTheDocument();
    // Other note still visible.
    expect(screen.getByTestId("pinned-note-11")).toBeInTheDocument();
  });

  it("returns null when no pinned notes", () => {
    const { container } = renderWithProviders(
      <PinnedNoteBanner notes={[]} categories={categories} />,
    );

    expect(container.firstChild).toBeNull();
  });
});

/* --------------------------------------------------------------------------
   NoteThread tests
   -------------------------------------------------------------------------- */

describe("NoteThread", () => {
  const parentNote = makeNote({
    id: 100,
    content_md: "Parent note content",
  });

  const replies = [
    makeNote({
      id: 101,
      parent_note_id: 100,
      content_md: "Reply one",
    }),
    makeNote({
      id: 102,
      parent_note_id: 100,
      content_md: "Reply two",
    }),
  ];

  it("shows replies", () => {
    renderWithProviders(
      <NoteThread
        parentNote={parentNote}
        replies={replies}
        categories={categories}
      />,
    );

    expect(screen.getByTestId("note-thread")).toBeInTheDocument();
    expect(screen.getByTestId("parent-note")).toBeInTheDocument();
    expect(screen.getByTestId("reply-101")).toBeInTheDocument();
    expect(screen.getByTestId("reply-102")).toBeInTheDocument();
  });

  it("shows resolution status as Open", () => {
    renderWithProviders(
      <NoteThread
        parentNote={parentNote}
        replies={[]}
        categories={categories}
      />,
    );

    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows Resolved status when resolved", () => {
    const resolved = makeNote({
      id: 100,
      resolved_at: "2026-02-23T12:00:00Z",
      resolved_by: 1,
    });

    renderWithProviders(
      <NoteThread
        parentNote={resolved}
        replies={[]}
        categories={categories}
      />,
    );

    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("calls onResolve when resolve button clicked", () => {
    const onResolve = vi.fn();
    renderWithProviders(
      <NoteThread
        parentNote={parentNote}
        replies={[]}
        categories={categories}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByTestId("resolve-btn"));
    expect(onResolve).toHaveBeenCalledWith(100);
  });

  it("calls onUnresolve when unresolve button clicked", () => {
    const onUnresolve = vi.fn();
    const resolved = makeNote({
      id: 100,
      resolved_at: "2026-02-23T12:00:00Z",
      resolved_by: 1,
    });

    renderWithProviders(
      <NoteThread
        parentNote={resolved}
        replies={[]}
        categories={categories}
        onUnresolve={onUnresolve}
      />,
    );

    fireEvent.click(screen.getByTestId("unresolve-btn"));
    expect(onUnresolve).toHaveBeenCalledWith(100);
  });
});

/* --------------------------------------------------------------------------
   VisibilitySelector tests
   -------------------------------------------------------------------------- */

describe("VisibilitySelector", () => {
  it("renders all visibility options", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilitySelector value="team" onChange={onChange} />,
    );

    expect(screen.getByTestId("visibility-selector")).toBeInTheDocument();
    // The select element should be present.
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("defaults to Team", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilitySelector value="team" onChange={onChange} />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("team");
  });
});

/* --------------------------------------------------------------------------
   Hook key factory tests
   -------------------------------------------------------------------------- */

describe("productionNoteKeys", () => {
  it("all key is stable", () => {
    expect(productionNoteKeys.all).toEqual(["production-notes"]);
  });

  it("byEntity includes type and id", () => {
    expect(productionNoteKeys.byEntity("scene", 42)).toEqual([
      "production-notes",
      "entity",
      "scene",
      42,
    ]);
  });

  it("pinned includes type and id", () => {
    expect(productionNoteKeys.pinned("project", 5)).toEqual([
      "production-notes",
      "pinned",
      "project",
      5,
    ]);
  });

  it("thread includes noteId", () => {
    expect(productionNoteKeys.thread(99)).toEqual([
      "production-notes",
      "thread",
      99,
    ]);
  });

  it("search includes query", () => {
    expect(productionNoteKeys.search("hello")).toEqual([
      "production-notes",
      "search",
      "hello",
    ]);
  });

  it("categories key is stable", () => {
    expect(productionNoteKeys.categories).toEqual([
      "production-notes",
      "categories",
    ]);
  });

  it("detail includes id", () => {
    expect(productionNoteKeys.detail(7)).toEqual([
      "production-notes",
      "detail",
      7,
    ]);
  });
});
