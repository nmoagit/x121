/**
 * Category card and group components for the naming rules page (PRD-116).
 */

import { TERMINAL_PANEL, TERMINAL_HEADER_TITLE, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

import type { NamingCategory, NamingRule } from "../types";
import { TYPO_DATA_CYAN } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Category card
   -------------------------------------------------------------------------- */

interface CategoryCardProps {
  category: NamingCategory;
  rule: NamingRule | null;
  isSelected: boolean;
  onSelect: () => void;
}

export function CategoryCard({ category, rule, isSelected, onSelect }: CategoryCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        TERMINAL_PANEL,
        "w-full text-left p-[var(--spacing-4)] transition-colors duration-[var(--duration-fast)]",
        TERMINAL_ROW_HOVER,
        isSelected && "ring-1 ring-cyan-400/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`${TYPO_DATA_CYAN} font-medium`}>
              {category.name}
            </span>
            {rule?.is_active && (
              <span className="text-[10px] text-[var(--color-data-green)] font-mono uppercase">Active</span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)] font-mono line-clamp-2">
            {category.description}
          </p>
        </div>
      </div>

      {/* Current template */}
      {rule && (
        <div className="mt-[var(--spacing-3)] px-2.5 py-1.5 text-xs font-mono
          bg-[var(--color-surface-secondary)] text-[var(--color-data-cyan)]
          rounded-[var(--radius-md)] truncate">
          {rule.template}
        </div>
      )}

      {/* Example output */}
      {category.example_output && (
        <div className="mt-1.5 text-[10px] text-[var(--color-text-muted)] font-mono truncate">
          Example: {category.example_output}
        </div>
      )}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Category group section
   -------------------------------------------------------------------------- */

interface CategoryGroupProps {
  label: string;
  categoryNames: readonly string[];
  categories: NamingCategory[];
  rulesByCategory: Map<number, NamingRule>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CategoryGroup({
  label,
  categoryNames,
  categories,
  rulesByCategory,
  selectedId,
  onSelect,
}: CategoryGroupProps) {
  const matching = categories.filter((c) => categoryNames.includes(c.name));

  if (matching.length === 0) return null;

  return (
    <div>
      <h2 className={cn(TERMINAL_HEADER_TITLE, "mb-[var(--spacing-3)]")}>
        {label}
      </h2>
      <div className="grid grid-cols-1 gap-[var(--spacing-3)] md:grid-cols-2 lg:grid-cols-3">
        {matching.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            rule={rulesByCategory.get(cat.id) ?? null}
            isSelected={selectedId === cat.id}
            onSelect={() => onSelect(cat.id)}
          />
        ))}
      </div>
    </div>
  );
}
