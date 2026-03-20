/**
 * Admin page for managing dynamic naming rules (PRD-116).
 *
 * Displays naming categories grouped by domain (Generation, Storage, Export,
 * Delivery) with current templates and example outputs. Clicking a category
 * card opens the inline RuleEditor for template editing.
 */

import { useMemo, useState } from "react";

import { WireframeLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_PANEL, TERMINAL_BODY } from "@/lib/ui-classes";
import { AlertCircle, FileText } from "@/tokens/icons";

import { CategoryGroup } from "./components/CategoryCard";
import { RuleEditor } from "./components/RuleEditor";
import { useNamingCategories, useNamingRules } from "./hooks/use-naming-rules";
import type { NamingRule } from "./types";
import { CATEGORY_GROUPS } from "./types";

/* --------------------------------------------------------------------------
   Main page component
   -------------------------------------------------------------------------- */

export function NamingRulesPage() {
  useSetPageTitle("Naming Rules", "Configure filename templates for generated assets, exports, and deliveries.");

  const { data: categories, isLoading: categoriesLoading, error: categoriesError } =
    useNamingCategories();
  const { data: rules, isLoading: rulesLoading } = useNamingRules();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  /** Map from category_id to the first active rule for that category. */
  const rulesByCategory = useMemo(() => {
    const map = new Map<number, NamingRule>();
    if (!rules) return map;
    for (const rule of rules) {
      // Prefer active rules; keep first match per category
      if (!map.has(rule.category_id) || rule.is_active) {
        map.set(rule.category_id, rule);
      }
    }
    return map;
  }, [rules]);

  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId) ?? null;
  const selectedRule = selectedCategoryId
    ? rulesByCategory.get(selectedCategoryId) ?? null
    : null;

  const isLoading = categoriesLoading || rulesLoading;

  return (
    <Stack gap={6}>
      {/* Content area */}
      {isLoading ? (
        <div className="flex items-center justify-center py-[var(--spacing-8)]">
          <WireframeLoader size={64} />
        </div>
      ) : categoriesError ? (
        <div className={TERMINAL_PANEL}>
          <div className={`${TERMINAL_BODY} flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]`}>
            <AlertCircle
              size={24}
              className="text-red-400"
              aria-hidden
            />
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              Failed to load naming categories.
            </p>
          </div>
        </div>
      ) : categories && categories.length > 0 ? (
        <Stack gap={6}>
          {/* Category groups */}
          {CATEGORY_GROUPS.map((group) => (
            <CategoryGroup
              key={group.label}
              label={group.label}
              categoryNames={group.categories}
              categories={categories}
              rulesByCategory={rulesByCategory}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          ))}

          {/* Inline editor */}
          {selectedCategory && (
            <RuleEditor
              key={selectedCategory.id}
              category={selectedCategory}
              rule={selectedRule}
              onClose={() => setSelectedCategoryId(null)}
            />
          )}
        </Stack>
      ) : (
        <div className={TERMINAL_PANEL}>
          <div className={`${TERMINAL_BODY} flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]`}>
            <FileText size={32} className="text-[var(--color-text-muted)]" aria-hidden />
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              No naming categories configured.
            </p>
          </div>
        </div>
      )}
    </Stack>
  );
}
