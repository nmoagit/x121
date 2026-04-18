/**
 * Admin page for managing dynamic naming rules (PRD-116, PRD-139).
 *
 * In pipeline workspace context: shows that pipeline's naming_rules JSONB
 * config with inline editing.
 *
 * In admin context (outside pipeline): displays naming categories grouped by
 * domain (Generation, Storage, Export, Delivery) with current templates and
 * example outputs. Optionally filter by pipeline via a selector dropdown.
 */

import { useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Select, ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_PANEL, TERMINAL_BODY } from "@/lib/ui-classes";
import { AlertCircle, FileText } from "@/tokens/icons";
import { usePipelineContextSafe } from "@/features/pipelines/PipelineProvider";
import { usePipelines } from "@/features/pipelines/hooks/use-pipelines";

import { CategoryGroup } from "./components/CategoryCard";
import { RuleEditor } from "./components/RuleEditor";
import { PipelineNamingRulesEditor } from "./PipelineNamingRulesEditor";
import { useNamingCategories, useNamingRules } from "./hooks/use-naming-rules";
import type { NamingRule } from "./types";
import { CATEGORY_GROUPS } from "./types";

/* --------------------------------------------------------------------------
   Main page component
   -------------------------------------------------------------------------- */

export function NamingRulesPage() {
  const pipelineCtx = usePipelineContextSafe();

  useSetPageTitle(
    pipelineCtx ? `Naming Rules — ${pipelineCtx.pipeline.name}` : "Naming Rules",
    "Configure filename templates for generated assets, exports, and deliveries.",
  );

  // If inside pipeline context, render the pipeline naming rules editor.
  if (pipelineCtx) {
    return <PipelineNamingRulesEditor pipeline={pipelineCtx.pipeline} />;
  }

  // Admin context: show the full naming rules page with optional pipeline selector.
  return <AdminNamingRulesView />;
}

/* --------------------------------------------------------------------------
   Admin naming rules view (outside pipeline context)
   -------------------------------------------------------------------------- */

function AdminNamingRulesView() {
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } =
    useNamingCategories();
  const { data: rules, isLoading: rulesLoading } = useNamingRules();
  const { data: pipelines } = usePipelines();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

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

  const selectedPipeline = pipelines?.find((p) => p.id === selectedPipelineId) ?? null;

  const isLoading = categoriesLoading || rulesLoading;

  const pipelineOptions = [
    { label: "Global Rules", value: "" },
    ...(pipelines?.map((p) => ({ label: p.name, value: String(p.id) })) ?? []),
  ];

  return (
    <Stack gap={6}>
      {/* Pipeline selector */}
      <div className="max-w-xs">
        <Select
          label="Pipeline Scope"
          value={selectedPipelineId != null ? String(selectedPipelineId) : ""}
          onChange={(v) => {
            setSelectedPipelineId(v ? Number(v) : null);
            setSelectedCategoryId(null);
          }}
          options={pipelineOptions}
        />
      </div>

      {/* Pipeline-specific editor when a pipeline is selected */}
      {selectedPipeline ? (
        <PipelineNamingRulesEditor pipeline={selectedPipeline} />
      ) : (
        <>
          {/* Content area */}
          {isLoading ? (
            <div className="flex items-center justify-center py-[var(--spacing-8)]">
              <ContextLoader size={64} />
            </div>
          ) : categoriesError ? (
            <div className={TERMINAL_PANEL}>
              <div className={`${TERMINAL_BODY} flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]`}>
                <AlertCircle
                  size={24}
                  className="text-[var(--color-data-red)]"
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

              {/* Editor modal */}
              <Modal
                open={selectedCategory != null}
                onClose={() => setSelectedCategoryId(null)}
                title={selectedCategory ? `Edit Template: ${selectedCategory.name}` : ""}
                size="2xl"
              >
                {selectedCategory && (
                  <RuleEditor
                    key={selectedCategory.id}
                    category={selectedCategory}
                    rule={selectedRule}
                    onClose={() => setSelectedCategoryId(null)}
                  />
                )}
              </Modal>
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
        </>
      )}
    </Stack>
  );
}
