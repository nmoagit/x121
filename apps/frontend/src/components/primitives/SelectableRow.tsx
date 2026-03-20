/**
 * Clickable list row with selected state and keyboard accessibility.
 *
 * Used in list/detail layouts where clicking a row selects it
 * (wiki articles, workflow list, onboarding sessions, etc.).
 */

import type { ReactNode } from "react";

interface SelectableRowProps {
  /** Whether this row is currently selected. */
  isSelected: boolean;
  /** Called when the row is clicked or activated via keyboard. */
  onSelect: () => void;
  /** Row content. */
  children: ReactNode;
}

export function SelectableRow({
  isSelected,
  onSelect,
  children,
}: SelectableRowProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 cursor-pointer transition-colors ${
        isSelected
          ? "border-[var(--color-action-primary)] bg-[#161b22]"
          : "border-[var(--color-border-default)]/30 bg-[#0d1117] hover:bg-[#161b22]"
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      {children}
    </div>
  );
}
