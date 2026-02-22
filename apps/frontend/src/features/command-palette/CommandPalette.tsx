/**
 * Command palette modal (PRD-31).
 *
 * Opens with Cmd+K / Ctrl+K. Shows recent items when empty,
 * search results when the user types a query. Supports keyboard
 * navigation and category filtering.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { Search } from "@/tokens/icons";

import { commandRegistry } from "./commandRegistry";
import { sortByFrecency } from "./frecencyScorer";
import { useRecentItems, useRecordAccess } from "./hooks/use-command-palette";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";
import { PaletteResult } from "./PaletteResult";
import { RecentItems } from "./RecentItems";
import type {
  PaletteCategory,
  PaletteResult as PaletteResultType,
  UserRecentItem,
} from "./types";

const CATEGORY_LABELS: Record<PaletteCategory, string> = {
  all: "All",
  commands: "Commands",
  entities: "Entities",
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const { data: recentItems = [] } = useRecentItems();
  const recordAccess = useRecordAccess();

  // Build results from command registry when user types
  const commandResults = useMemo(() => {
    if (!query.trim()) return [];
    return commandRegistry.search(query);
  }, [query]);

  // Merge command results and recent entity results into PaletteResult[]
  const allResults = useMemo((): PaletteResultType[] => {
    if (!query.trim()) return [];

    const results: PaletteResultType[] = commandResults.map((cmd) => ({
      type: "command" as const,
      command: cmd,
    }));

    return results;
  }, [query, commandResults]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
    }
  }, []);

  const handleSelectResult = useCallback(
    (index: number) => {
      const result = allResults[index];
      if (!result) return;

      if (result.type === "command" && result.command) {
        result.command.execute();
      }

      handleClose();
    },
    [allResults, handleClose],
  );

  const handleSelectRecent = useCallback(
    (item: UserRecentItem) => {
      recordAccess.mutate({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      });
      handleClose();
    },
    [recordAccess, handleClose],
  );

  // Filter results by category
  const {
    selectedIndex,
    activeCategory,
    setActiveCategory,
    handleKeyDown,
    resetSelection,
  } = useKeyboardNavigation({
    itemCount: query.trim() ? allResults.length : sortByFrecency(recentItems).length,
    onSelect: (index) => {
      if (query.trim()) {
        handleSelectResult(index);
      } else {
        const sorted = sortByFrecency(recentItems);
        if (sorted[index]) {
          handleSelectRecent(sorted[index]);
        }
      }
    },
    onClose: handleClose,
  });

  const filteredResults = useMemo(() => {
    if (activeCategory === "all") return allResults;
    if (activeCategory === "commands")
      return allResults.filter((r) => r.type === "command");
    return allResults.filter((r) => r.type === "entity");
  }, [allResults, activeCategory]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            previousFocusRef.current = document.activeElement;
          }
          return !prev;
        });
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset selection when query changes
  useEffect(() => {
    resetSelection();
  }, [query, resetSelection]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return createPortal(
    <div
      data-testid="command-palette-overlay"
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center pt-[15vh]",
        "bg-[var(--color-surface-overlay)]",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      onClick={handleBackdropClick}
    >
      <div
        data-testid="command-palette"
        className={cn(
          "w-full max-w-lg mx-4",
          "bg-[var(--color-surface-secondary)] rounded-[var(--radius-lg)]",
          "shadow-[var(--shadow-lg)]",
          "animate-[scaleIn_var(--duration-fast)_var(--ease-default)]",
          "overflow-hidden",
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] px-4 py-3">
          <Search
            size={20}
            className="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "flex-1 bg-transparent text-sm text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-muted)]",
              "focus:outline-none",
            )}
          />
          <kbd
            className={cn(
              "shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5",
              "bg-[var(--color-surface-primary)] text-xs text-[var(--color-text-muted)]",
              "border border-[var(--color-border-default)]",
            )}
          >
            Esc
          </kbd>
        </div>

        {/* Category tabs */}
        <div
          data-testid="category-tabs"
          className="flex gap-1 border-b border-[var(--color-border-default)] px-3 py-1.5"
        >
          {(Object.keys(CATEGORY_LABELS) as PaletteCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              data-testid={`category-tab-${cat}`}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium",
                "transition-colors duration-[var(--duration-fast)]",
                activeCategory === cat
                  ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
              )}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Results area */}
        <div
          className="max-h-[60vh] overflow-y-auto p-2"
          role="listbox"
          aria-label="Command palette results"
        >
          {!query.trim() ? (
            <RecentItems
              items={recentItems}
              selectedIndex={selectedIndex}
              onSelect={handleSelectRecent}
            />
          ) : filteredResults.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
              No results found
            </div>
          ) : (
            filteredResults.map((result, index) => (
              <PaletteResult
                key={
                  result.type === "command"
                    ? `cmd-${result.command?.id}`
                    : `entity-${result.entity?.id}`
                }
                result={result}
                isSelected={index === selectedIndex}
                onClick={() => {
                  if (result.type === "command" && result.command) {
                    result.command.execute();
                  }
                  handleClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
