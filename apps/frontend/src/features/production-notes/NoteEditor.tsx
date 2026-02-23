/**
 * Note editor component for production notes (PRD-95).
 *
 * Provides a Markdown textarea with preview toggle, category selector,
 * visibility selector, @mention detection, and save/cancel actions.
 */

import { useState } from "react";

import { Badge, Button, Select } from "@/components";

import { VisibilitySelector } from "./VisibilitySelector";
import type {
  NoteCategory,
  NoteEntityType,
  NoteVisibility,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface NoteEditorProps {
  /** Available categories. */
  categories: NoteCategory[];
  /** Entity this note is attached to. */
  entityType: NoteEntityType;
  /** ID of the entity. */
  entityId: number;
  /** Called when the note is saved. */
  onSave: (data: {
    content_md: string;
    category_id: number;
    visibility: NoteVisibility;
    parent_note_id?: number | null;
  }) => void;
  /** Called when cancel is clicked. */
  onCancel: () => void;
  /** Pre-fill content for editing an existing note. */
  initialContent?: string;
  /** Pre-fill category for editing. */
  initialCategoryId?: number;
  /** Pre-fill visibility for editing. */
  initialVisibility?: NoteVisibility;
  /** Parent note ID when replying to a thread. */
  parentNoteId?: number | null;
  /** Whether a save operation is in-flight. */
  isLoading?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function NoteEditor({
  categories,
  onSave,
  onCancel,
  initialContent = "",
  initialCategoryId,
  initialVisibility = "team",
  parentNoteId = null,
  isLoading = false,
}: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [categoryId, setCategoryId] = useState<number>(
    initialCategoryId ?? categories[0]?.id ?? 0,
  );
  const [visibility, setVisibility] =
    useState<NoteVisibility>(initialVisibility);
  const [showPreview, setShowPreview] = useState(false);

  const mentions = extractMentions(content);

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({
      content_md: content.trim(),
      category_id: categoryId,
      visibility,
      parent_note_id: parentNoteId,
    });
  };

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <div
      data-testid="note-editor"
      className="space-y-3 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex-1" data-testid="category-selector">
          <Select
            label="Category"
            options={categoryOptions}
            value={String(categoryId)}
            onChange={(v) => setCategoryId(Number(v))}
          />
        </div>
        <div className="flex-1">
          <VisibilitySelector
            value={visibility}
            onChange={setVisibility}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          data-testid="preview-toggle"
        >
          {showPreview ? "Edit" : "Preview"}
        </Button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div
          data-testid="note-preview"
          className="min-h-24 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm text-[var(--color-text-primary)]"
        >
          {content || "(empty)"}
        </div>
      ) : (
        <textarea
          data-testid="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a note (Markdown supported). Use @ to mention users."
          rows={5}
          className="w-full resize-y rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
      )}

      {/* Mentions indicator */}
      {mentions.length > 0 && (
        <div
          data-testid="mentions-indicator"
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
        >
          Mentioning:
          {mentions.map((m) => (
            <Badge key={m} variant="info" size="sm">
              @{m}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          data-testid="save-btn"
          variant="primary"
          size="sm"
          disabled={!content.trim() || isLoading}
          onClick={handleSave}
        >
          Save
        </Button>
        <Button
          data-testid="cancel-btn"
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Extract @username mentions from text. */
function extractMentions(text: string): string[] {
  const matches = text.match(/(?:^|\s)@([\w-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim().slice(1)))];
}
