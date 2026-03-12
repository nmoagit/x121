/**
 * WidgetCatalogue -- slide-out panel listing available widgets grouped
 * by category (PRD-89).
 *
 * Each widget shows name, description, and default size. Clicking a
 * widget adds it to the current dashboard layout.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { Drawer } from "@/components/composite";
import { cn } from "@/lib/cn";
import { Plus } from "@/tokens/icons";

import type { WidgetCategory, WidgetDefinition } from "./types";
import { WIDGET_CATEGORY_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ALL_CATEGORIES: WidgetCategory[] = [
  "monitoring",
  "productivity",
  "reporting",
  "system",
];

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function CategoryFilter({
  active,
  onChange,
}: {
  active: WidgetCategory | null;
  onChange: (cat: WidgetCategory | null) => void;
}) {
  return (
    <div data-testid="category-filter" className="flex flex-wrap gap-2 mb-4">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "px-3 py-1 text-xs rounded-[var(--radius-full)] transition-colors",
          active === null
            ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
            : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]",
        )}
      >
        All
      </button>
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={cn(
            "px-3 py-1 text-xs rounded-[var(--radius-full)] transition-colors",
            active === cat
              ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
              : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]",
          )}
        >
          {WIDGET_CATEGORY_LABEL[cat]}
        </button>
      ))}
    </div>
  );
}

function WidgetCard({
  widget,
  onAdd,
}: {
  widget: WidgetDefinition;
  onAdd: (widget: WidgetDefinition) => void;
}) {
  return (
    <div
      data-testid={`widget-card-${widget.id}`}
      className={cn(
        "flex items-start justify-between gap-3 p-3",
        "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
        "hover:bg-[var(--color-surface-tertiary)] transition-colors",
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {widget.name}
        </span>
        <span className="text-xs text-[var(--color-text-muted)] line-clamp-2">
          {widget.description}
        </span>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="info" size="sm">
            {WIDGET_CATEGORY_LABEL[widget.category]}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
            {widget.default_width}x{widget.default_height}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() => onAdd(widget)}
        aria-label={`Add ${widget.name}`}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface WidgetCatalogueProps {
  open: boolean;
  onClose: () => void;
  widgets: WidgetDefinition[];
  onAddWidget: (widget: WidgetDefinition) => void;
}

export function WidgetCatalogue({
  open,
  onClose,
  widgets,
  onAddWidget,
}: WidgetCatalogueProps) {
  const [activeCategory, setActiveCategory] = useState<WidgetCategory | null>(
    null,
  );

  const filtered = activeCategory
    ? widgets.filter((w) => w.category === activeCategory)
    : widgets;

  return (
    <Drawer open={open} onClose={onClose} title="Widget Catalogue" size="md">
      <div data-testid="widget-catalogue">
        <CategoryFilter active={activeCategory} onChange={setActiveCategory} />

        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No widgets available in this category.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((widget) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onAdd={onAddWidget}
              />
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
