/**
 * Single result item in the command palette (PRD-31).
 *
 * Renders either a command or an entity with icon, name, category,
 * and optional shortcut hint.
 */

import { cn } from "@/lib/cn";
import { Search } from "@/tokens/icons";

import type { PaletteResult as PaletteResultType } from "./types";
import { ENTITY_TYPE_LABELS } from "./types";

interface PaletteResultProps {
  result: PaletteResultType;
  isSelected: boolean;
  onClick: () => void;
}

export function PaletteResult({
  result,
  isSelected,
  onClick,
}: PaletteResultProps) {
  const label =
    result.type === "command"
      ? result.command?.label ?? ""
      : `${ENTITY_TYPE_LABELS[result.entity?.entity_type ?? ""] ?? result.entity?.entity_type} #${result.entity?.entity_id}`;

  const category =
    result.type === "command"
      ? result.command?.category ?? ""
      : result.entity?.entity_type ?? "";

  const shortcut =
    result.type === "command" ? result.command?.shortcut : undefined;

  return (
    <button
      type="button"
      data-testid="palette-result-item"
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
        "rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)]",
        isSelected
          ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
      )}
      onClick={onClick}
    >
      <Search size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />

      <span className="flex-1 truncate">{label}</span>

      <span className="text-xs text-[var(--color-text-muted)]">{category}</span>

      {shortcut && (
        <kbd
          className={cn(
            "ml-2 shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5",
            "bg-[var(--color-surface-primary)] text-xs text-[var(--color-text-muted)]",
            "border border-[var(--color-border-default)]",
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
