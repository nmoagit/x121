import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { TagChip } from "./TagChip";
import type { TagInfo, TagWithCount } from "./TagChip";

interface TagInputProps {
  entityType: string;
  entityId: number;
  existingTags: TagInfo[];
  onTagsChange: (tags: TagInfo[]) => void;
  placeholder?: string;
  className?: string;
}

/** Debounce delay for autocomplete requests (ms). */
const DEBOUNCE_MS = 200;

/**
 * Chips-style tag input with autocomplete suggestions.
 *
 * Displays existing tags as removable chips. As the user types, autocomplete
 * suggestions are fetched from the API. New tags are created on first use
 * when the user presses Enter.
 */
export function TagInput({
  entityType,
  entityId,
  existingTags,
  onTagsChange,
  placeholder = "Add tag...",
  className,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<TagWithCount[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch suggestions when input changes (debounced).
  useEffect(() => {
    if (input.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get<TagWithCount[]>(
          `/tags/suggest?prefix=${encodeURIComponent(input.trim())}&limit=10`,
        );
        // Filter out tags already applied.
        const existingIds = new Set(existingTags.map((t) => t.id));
        const filtered = results.filter((s) => !existingIds.has(s.id));
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
  }, [input, existingTags]);

  // Close suggestions on click outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const applyTag = useCallback(
    async (tagName: string) => {
      if (!tagName.trim()) return;

      try {
        const updatedTags = await api.post<TagInfo[]>(`/entities/${entityType}/${entityId}/tags`, {
          tag_names: [tagName.trim()],
        });
        onTagsChange(updatedTags);
        setInput("");
        setSuggestions([]);
        setShowSuggestions(false);
        inputRef.current?.focus();
      } catch {
        // Silently fail; the user can retry.
      }
    },
    [entityType, entityId, onTagsChange],
  );

  const removeTag = useCallback(
    async (tagId: number) => {
      try {
        await api.delete(`/entities/${entityType}/${entityId}/tags/${tagId}`);
        onTagsChange(existingTags.filter((t) => t.id !== tagId));
      } catch {
        // Silently fail; the user can retry.
      }
    },
    [entityType, entityId, existingTags, onTagsChange],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (
        highlightIndex >= 0 &&
        highlightIndex < suggestions.length &&
        suggestions[highlightIndex]
      ) {
        applyTag(suggestions[highlightIndex].display_name);
      } else if (input.trim()) {
        applyTag(input);
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

  const isNewTag =
    input.trim().length > 0 &&
    !suggestions.some((s) => s.name === input.trim().toLowerCase()) &&
    !existingTags.some((t) => t.name === input.trim().toLowerCase());

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 p-2",
          "bg-[var(--color-surface-secondary)]",
          "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
          "focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-0",
          "transition-colors duration-150",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {existingTags.map((tag) => (
          <TagChip key={tag.id} tag={tag} size="sm" onRemove={() => removeTag(tag.id)} />
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder={existingTags.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[8rem] bg-transparent text-sm",
            "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
            "outline-none border-none p-0",
          )}
        />
      </div>

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
              onClick={() => applyTag(suggestion.display_name)}
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
              onClick={() => applyTag(input)}
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
  );
}

export type { TagInputProps };
