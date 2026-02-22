/**
 * Keyboard navigation hook for the command palette (PRD-31).
 *
 * Handles arrow key navigation, Enter to select, Escape to close,
 * and Tab to switch categories.
 */

import { useCallback, useState } from "react";

import type { PaletteCategory } from "../types";

const CATEGORIES: PaletteCategory[] = ["all", "commands", "entities"];

interface UseKeyboardNavigationOptions {
  itemCount: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function useKeyboardNavigation({
  itemCount,
  onSelect,
  onClose,
}: UseKeyboardNavigationOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>("all");

  const resetSelection = useCallback(() => {
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < itemCount - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : itemCount - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (itemCount > 0) {
            onSelect(selectedIndex);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          setActiveCategory((prev) => {
            const currentIdx = CATEGORIES.indexOf(prev);
            const nextIdx = (currentIdx + 1) % CATEGORIES.length;
            return CATEGORIES[nextIdx] ?? "all";
          });
          setSelectedIndex(0);
          break;
      }
    },
    [itemCount, selectedIndex, onSelect, onClose],
  );

  return {
    selectedIndex,
    setSelectedIndex,
    activeCategory,
    setActiveCategory,
    handleKeyDown,
    resetSelection,
  };
}
