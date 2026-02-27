/**
 * Category card and group components for the naming rules page (PRD-116).
 */

import { Badge } from "@/components/primitives";

import type { NamingCategory, NamingRule } from "../types";

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
      className={`w-full text-left rounded-[var(--radius-lg)] border p-[var(--spacing-4)]
        transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]
        ${
          isSelected
            ? "border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]"
            : "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] hover:border-[var(--color-border-hover)]"
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {category.name}
            </span>
            {rule?.is_active && (
              <Badge variant="success" size="sm">Active</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
            {category.description}
          </p>
        </div>
      </div>

      {/* Current template */}
      {rule && (
        <div className="mt-[var(--spacing-3)] px-2.5 py-1.5 text-xs font-mono
          bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]
          rounded-[var(--radius-md)] truncate">
          {rule.template}
        </div>
      )}

      {/* Example output */}
      {category.example_output && (
        <div className="mt-1.5 text-xs text-[var(--color-text-muted)] truncate">
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
      <h2 className="mb-[var(--spacing-3)] text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
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
