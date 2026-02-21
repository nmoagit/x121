/**
 * Global search bar with typeahead suggestions (PRD-20).
 *
 * Features:
 * - Debounced typeahead (100ms delay)
 * - Results grouped by entity type with badges
 * - Keyboard navigation (up/down arrows, Enter to select, Esc to dismiss)
 * - Click-away to close suggestions
 */

import { useState, useCallback, useEffect, useRef } from "react";

import { Badge, Input } from "@/components/primitives";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useTypeahead } from "./hooks/use-search";
import { entityTypeLabel, type TypeaheadResult } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SearchBarProps {
  /** Called when the user selects a typeahead result. */
  onResultSelect?: (result: TypeaheadResult) => void;
  /** Called when the user submits a full search (Enter with no selection). */
  onSearch?: (query: string) => void;
  /** Placeholder text. */
  placeholder?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 100;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SearchBar({
  onResultSelect,
  onSearch,
  placeholder = "Search characters, projects, scenes...",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [] } = useTypeahead(debouncedQuery);

  // Show dropdown when we have results
  useEffect(() => {
    setIsOpen(results.length > 0 && debouncedQuery.length >= 2);
    setSelectedIndex(-1);
  }, [results, debouncedQuery]);

  // Click-away handler (shared hook)
  useClickOutside(containerRef, () => setIsOpen(false));

  const handleSelect = useCallback(
    (result: TypeaheadResult) => {
      setIsOpen(false);
      setQuery("");
      onResultSelect?.(result);
    },
    [onResultSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "Enter" && query.trim()) {
          onSearch?.(query.trim());
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1,
          );
          break;
        case "Enter": {
          e.preventDefault();
          const selected = results[selectedIndex];
          if (selectedIndex >= 0 && selected) {
            handleSelect(selected);
          } else if (query.trim()) {
            setIsOpen(false);
            onSearch?.(query.trim());
          }
          break;
        }
        case "Escape":
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex, query, handleSelect, onSearch],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0 && debouncedQuery.length >= 2) {
            setIsOpen(true);
          }
        }}
        aria-label="Search"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        role="combobox"
      />

      {isOpen && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg"
        >
          {results.map((result, index) => (
            <li
              key={`${result.entity_type}-${result.entity_id}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                index === selectedIndex
                  ? "bg-[var(--color-surface-tertiary)]"
                  : "hover:bg-[var(--color-surface-secondary)]"
              }`}
              onMouseDown={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Badge size="sm" variant="info">
                {entityTypeLabel(result.entity_type)}
              </Badge>
              <span className="text-sm text-[var(--color-text-primary)] truncate">
                {result.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
