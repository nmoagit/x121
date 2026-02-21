/**
 * PanelHeader component (PRD-30).
 *
 * Renders the header bar of a panel with:
 * - A drag handle (grip icon)
 * - The panel title (view module label)
 * - A collapse/expand toggle (chevron)
 */

import { ChevronDown, ChevronRight, GripVertical } from "@/tokens/icons";

interface PanelHeaderProps {
  /** Title displayed in the header (typically the view module label). */
  title: string;
  /** Whether the panel body is currently collapsed. */
  collapsed: boolean;
  /** Callback to toggle the collapsed state. */
  onToggleCollapse: () => void;
  /** Pointer-down handler for the drag handle. */
  onDragStart?: (event: React.PointerEvent) => void;
}

export function PanelHeader({
  title,
  collapsed,
  onToggleCollapse,
  onDragStart,
}: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1.5 select-none">
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] active:cursor-grabbing"
        onPointerDown={onDragStart}
        aria-label="Drag to reposition panel"
      >
        <GripVertical size={16} />
      </button>

      {/* Title */}
      <span className="flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
        {title}
      </span>

      {/* Collapse / expand toggle */}
      <button
        type="button"
        className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  );
}
