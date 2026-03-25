import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/composite";
import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Chip } from "@/components/primitives/Chip";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { TagInfo, TagWithCount } from "./TagChip";
import { TagChip } from "./TagChip";

interface BulkLabelDialogProps {
  open: boolean;
  mode: "add" | "remove";
  count: number;
  pipelineId?: number;
  /** Called when "add" mode confirms with tag names to apply. */
  onConfirm: (tagNames: string[]) => void;
  /** Called when "remove" mode confirms with tag IDs to remove. */
  onConfirmRemove?: (tagIds: number[]) => void;
  onCancel: () => void;
  loading?: boolean;
  /** Pre-loaded tags for the "remove" mode (common tags across selected items). */
  availableTags?: TagInfo[];
}

/** Max autocomplete suggestions to display. */
const MAX_SUGGESTIONS = 10;
/** Debounce delay for autocomplete requests (ms). */
const DEBOUNCE_MS = 200;

/**
 * Modal dialog for bulk-adding or bulk-removing labels from selected items.
 *
 * - "add" mode: text input with autocomplete, collects tag names.
 * - "remove" mode: displays available tags as selectable chips.
 */
export function BulkLabelDialog({
  open,
  mode,
  count,
  pipelineId,
  onConfirm,
  onConfirmRemove,
  onCancel,
  loading,
  availableTags = [],
}: BulkLabelDialogProps) {
  // Add mode state
  const [input, setInput] = useState("");
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<TagWithCount[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remove mode state
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  // Reset state when dialog opens/closes or mode changes
  useEffect(() => {
    if (!open) return;
    setInput("");
    setPendingNames([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    setSelectedTagIds(new Set());
  }, [open, mode]);

  // Autocomplete for add mode
  useEffect(() => {
    if (mode !== "add" || input.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const pipelineParam = pipelineId ? `&pipeline_id=${pipelineId}` : "";
        const results = await api.get<TagWithCount[]>(
          `/tags/suggest?prefix=${encodeURIComponent(input.trim())}&limit=${MAX_SUGGESTIONS}${pipelineParam}`,
        );
        const pendingSet = new Set(pendingNames.map((n) => n.toLowerCase()));
        const filtered = results.filter((s) => !pendingSet.has(s.name));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setHighlightIndex(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, mode, pipelineId, pendingNames]);

  const addPendingName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (pendingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return;
      setPendingNames((prev) => [...prev, trimmed]);
      setInput("");
      setSuggestions([]);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [pendingNames],
  );

  const removePendingName = useCallback((index: number) => {
    setPendingNames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleRemoveTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length && suggestions[highlightIndex]) {
        addPendingName(suggestions[highlightIndex].display_name);
      } else if (input.trim()) {
        addPendingName(input);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIndex(-1);
    }
  }

  const handleConfirm = () => {
    if (mode === "add") {
      // Include whatever is in the input field as well
      const names = [...pendingNames];
      if (input.trim() && !names.some((n) => n.toLowerCase() === input.trim().toLowerCase())) {
        names.push(input.trim());
      }
      if (names.length === 0) return;
      onConfirm(names);
    } else {
      if (selectedTagIds.size === 0) return;
      onConfirmRemove?.(Array.from(selectedTagIds));
    }
  };

  const handleCancel = () => {
    onCancel();
  };

  const isConfirmDisabled =
    mode === "add"
      ? pendingNames.length === 0 && !input.trim()
      : selectedTagIds.size === 0;

  const title =
    mode === "add"
      ? `Add labels to ${count} item${count !== 1 ? "s" : ""}`
      : `Remove labels from ${count} item${count !== 1 ? "s" : ""}`;

  const isNewTag =
    input.trim().length > 0 &&
    !suggestions.some((s) => s.name === input.trim().toLowerCase()) &&
    !pendingNames.some((n) => n.toLowerCase() === input.trim().toLowerCase());

  return (
    <Modal open={open} onClose={handleCancel} title={title} size="sm">
      <Stack gap={4}>
        {mode === "add" ? (
          <>
            {/* Pending tag chips */}
            {pendingNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {pendingNames.map((name, i) => (
                  <Chip key={name} size="sm" onRemove={() => removePendingName(i)}>
                    {name}
                  </Chip>
                ))}
              </div>
            )}

            {/* Autocomplete input */}
            <div className="relative">
              <Input
                ref={inputRef}
                label="Label name"
                size="sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Type a label name and press Enter..."
                autoFocus
              />

              {/* Suggestions dropdown */}
              {showSuggestions && (
                <div
                  className={cn(
                    "absolute z-50 left-0 right-0 mt-1",
                    "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
                    "rounded-[var(--radius-md)] shadow-[var(--shadow-md)]",
                    "max-h-48 overflow-y-auto",
                  )}
                  role="listbox"
                >
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      role="option"
                      aria-selected={index === highlightIndex}
                      onClick={() => addPendingName(suggestion.display_name)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm text-left",
                        "transition-colors duration-100",
                        index === highlightIndex
                          ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {suggestion.color && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: suggestion.color }}
                          />
                        )}
                        <span>{suggestion.display_name}</span>
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {suggestion.usage_count}
                      </span>
                    </button>
                  ))}

                  {isNewTag && (
                    <button
                      type="button"
                      onClick={() => addPendingName(input)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left",
                        "text-[var(--color-action-primary)] hover:bg-[var(--color-surface-tertiary)]",
                        "border-t border-[var(--color-border-default)]",
                        "transition-colors duration-100",
                      )}
                    >
                      <span className="font-medium">+</span>
                      <span>Create &quot;{input.trim()}&quot;</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Remove mode — selectable tag chips */
          <>
            {availableTags.length === 0 ? (
              <p className="font-mono text-xs text-[var(--color-text-muted)]">
                No labels found on the selected items.
              </p>
            ) : (
              <>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">
                  Select labels to remove:
                </p>
                <div className="flex flex-wrap gap-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleRemoveTag(tag.id)}
                    >
                      <TagChip
                        tag={tag}
                        size="sm"
                        className={cn(
                          "cursor-pointer transition-opacity",
                          selectedTagIds.has(tag.id) ? "ring-2 ring-red-500/50" : "opacity-60 hover:opacity-100",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="xs"
            onClick={handleConfirm}
            disabled={isConfirmDisabled || loading}
            loading={loading}
          >
            {mode === "add" ? "Apply" : "Remove"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

export type { BulkLabelDialogProps };
