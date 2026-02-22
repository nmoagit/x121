/**
 * Multi-select tag picker for review notes (PRD-38).
 *
 * Displays color-coded tag badges that can be toggled on/off.
 * Includes an optional inline "Create new tag" action.
 */

import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";

import type { ReviewTag } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TagSelectorProps {
  /** Available tags to choose from. */
  tags: ReviewTag[];
  /** Currently selected tag IDs. */
  selectedTagIds: number[];
  /** Called when selection changes. */
  onChange: (tagIds: number[]) => void;
  /** Called when a new tag is created inline. */
  onCreateTag?: (name: string) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TagSelector({
  tags,
  selectedTagIds,
  onChange,
  onCreateTag,
  disabled = false,
}: TagSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const selectedSet = new Set(selectedTagIds);

  const toggleTag = (tagId: number) => {
    if (disabled) return;
    if (selectedSet.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const handleCreateTag = () => {
    const trimmed = newTagName.trim();
    if (trimmed && onCreateTag) {
      onCreateTag(trimmed);
      setNewTagName("");
      setShowCreate(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="tag-selector">
      {/* Tag badges */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const isSelected = selectedSet.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleTag(tag.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                isSelected
                  ? "ring-2 ring-[var(--color-border-focus)] opacity-100"
                  : "opacity-70 hover:opacity-100"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
              }}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Remove" : "Add"} tag ${tag.name}`}
              data-testid={`tag-option-${tag.id}`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: tag.color }}
                aria-hidden="true"
              />
              {tag.name}
            </button>
          );
        })}
      </div>

      {/* Create new tag inline */}
      {onCreateTag && (
        <div>
          {showCreate ? (
            <div className="flex items-center gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag name..."
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                  if (e.key === "Escape") setShowCreate(false);
                }}
              />
              <Button size="sm" onClick={handleCreateTag} disabled={!newTagName.trim()}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-xs text-[var(--color-action-primary)] hover:underline"
            >
              + Create new tag
            </button>
          )}
        </div>
      )}
    </div>
  );
}
