/**
 * LayoutEditor -- CSS grid-based dashboard layout editor (PRD-89).
 *
 * Edit mode: dashed borders, drag handles, remove buttons.
 * View mode: clean widget display.
 * Responsive: 4-column desktop, 2 tablet, 1 mobile.
 */

import { cn } from "@/lib/cn";
import { GripVertical, Settings, X as XIcon } from "@/tokens/icons";

import type { LayoutItem, WidgetDefinition } from "./types";
import { GRID_COLS_DESKTOP } from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface GridItemProps {
  item: LayoutItem;
  widget: WidgetDefinition | undefined;
  isEditing: boolean;
  onRemove: (instanceId: string) => void;
  onSettings: (instanceId: string) => void;
}

function GridItem({
  item,
  widget,
  isEditing,
  onRemove,
  onSettings,
}: GridItemProps) {
  const widgetName = widget?.name ?? item.widget_id;

  return (
    <div
      data-testid={`grid-item-${item.instance_id}`}
      className={cn(
        "relative rounded-[var(--radius-md)] p-4",
        "bg-[var(--color-surface-secondary)]",
        "transition-all duration-[var(--duration-fast)]",
        isEditing
          ? "border-2 border-dashed border-[var(--color-border-focus)] cursor-move"
          : "border border-[var(--color-border-default)]",
      )}
      style={{
        gridColumn: `span ${Math.min(item.w, GRID_COLS_DESKTOP)}`,
        gridRow: `span ${item.h}`,
      }}
    >
      {/* Edit mode controls */}
      {isEditing && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSettings(item.instance_id)}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]"
            aria-label={`Settings for ${widgetName}`}
          >
            <Settings size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.instance_id)}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] hover:bg-[var(--color-surface-tertiary)]"
            aria-label={`Remove ${widgetName}`}
          >
            <XIcon size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Drag handle (edit mode only) */}
      {isEditing && (
        <div className="absolute top-2 left-2 text-[var(--color-text-muted)]">
          <GripVertical size={16} aria-hidden="true" />
        </div>
      )}

      {/* Widget content placeholder */}
      <div className={cn("flex flex-col gap-1", isEditing ? "ml-6" : "")}>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {widgetName}
        </span>
        {widget?.description && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {widget.description}
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface LayoutEditorProps {
  layout: LayoutItem[];
  widgetMap: Map<string, WidgetDefinition>;
  isEditing: boolean;
  onRemoveWidget: (instanceId: string) => void;
  onOpenSettings: (instanceId: string) => void;
}

export function LayoutEditor({
  layout,
  widgetMap,
  isEditing,
  onRemoveWidget,
  onOpenSettings,
}: LayoutEditorProps) {
  if (layout.length === 0) {
    return (
      <div
        data-testid="layout-editor-empty"
        className={cn(
          "flex items-center justify-center p-12",
          "border-2 border-dashed border-[var(--color-border-default)] rounded-[var(--radius-lg)]",
        )}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          {isEditing
            ? "Click \"Add Widget\" to get started."
            : "No widgets on this dashboard yet."}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="layout-editor"
      className={cn(
        "grid gap-4",
        /* Responsive columns: 1 mobile, 2 tablet, 4 desktop */
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {layout.map((item) => (
        <GridItem
          key={item.instance_id}
          item={item}
          widget={widgetMap.get(item.widget_id)}
          isEditing={isEditing}
          onRemove={onRemoveWidget}
          onSettings={onOpenSettings}
        />
      ))}
    </div>
  );
}
